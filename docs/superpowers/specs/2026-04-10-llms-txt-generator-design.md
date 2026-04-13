# llms.txt Generator — System Design Spec

## 1. Overview

A web application that automatically generates [llms.txt](https://llmstxt.org/) files for any website. Users input a URL, the system crawls the site extracting metadata (titles, descriptions, structure), and produces a structured llms.txt file conforming to the specification.

### Goals

- Accurate llms.txt generation reflecting site structure and content
- Handle sites of any size via checkpoint/resume architecture
- Frictionless first use (no signup), with accounts for repeat usage
- Scalable and resilient on AWS

### Non-Goals

- Real-time collaborative editing of llms.txt files
- Scheduled/recurring crawls (future feature)
- Custom llms.txt template editing

---

## 2. User Journey

### Anonymous User (first job)

1. Visits the app (React SPA on CloudFront)
2. Enters a website URL, optionally adjusts depth/page limits
3. Clicks "Generate" — a job is created, tracked via anonymous cookie (UUID in httpOnly cookie)
4. Sees real-time progress (pages found) via SSE stream
5. When complete, can view, copy, and download the llms.txt file
6. Can close the browser, return later, and still see their job via the cookie

### Authenticated User (2nd+ job)

1. When attempting a second job, prompted to sign up / sign in
2. Three auth methods: email + password, OAuth (Google/GitHub), magic link
3. After auth, anonymous job is migrated to their account
4. Dashboard shows all past crawls with re-download capability

---

## 3. Architecture

```
┌──────────────┐
│  CloudFront  │──── React SPA (S3 origin)
└──────┬───────┘
       │ API calls + SSE
       ▼
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│   NestJS     │────►│  SQS (jobs)  │────►│  Lambda Crawler  │
│  (ECS Fargate)│    └──────────────┘     │  (Cheerio/PW)    │
│              │                          │                  │
│  - Auth API  │                          │  Stateful in     │
│  - Job API   │                          │  memory: visited │
│  - SSE stream│                          │  set + pending   │
│              │                          │  queue           │
│  subscribes  │                          └────────┬─────────┘
│  to Redis    │                                   │
│  per active  │                       EventBridge (page.crawled)
│  SSE jobId   │                                   │
└──────┬───────┘                          ┌────────┴──────────┐
       │                                  │  EventBridge Rules │
       │                                  └──┬──────┬──────┬──┘
       │                                     │      │      │
       │                                     ▼      │      ▼
       │                               SQS (pages)  │   SQS (completed)
       │                                     │      │      │
       │                                     ▼      │      ▼
       │                              Consumer λ    │   Generator λ
       │                                │    │      │      │
       │                      Postgres ◄┘    └► Redis pub/sub
       │                                           │      │
       │                                     ▼     │      ▼
       │                              Monitor λ    └► Redis pub/sub
       │                              (cron 2min)
       │                                │
       ▼                                ▼
  ┌─────────┐                    SQS (jobs) re-enqueue
  │Postgres │
  │ (RDS)   │            Generator λ ──► S3 (llms.txt)
  └─────────┘                          ──► Redis pub/sub
```

### Component Responsibilities

| Component               | Responsibility                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React SPA**           | UI: URL input, progress display, results viewer, auth screens, dashboard                                                                                                    |
| **CloudFront**          | Serves React app from S3, caches static assets at the edge                                                                                                                  |
| **NestJS API**          | Auth (JWT), job CRUD, SSE stream per job, presigned S3 URLs. Subscribes to Redis `job:{id}` channels for active SSE connections only.                                       |
| **SQS (jobs)**          | Delivers crawl jobs to crawler Lambdas (root URL on first run, pending URLs on resume)                                                                                      |
| **Lambda Crawler**      | Stateful in memory: maintains visited set + pending queue. Emits `page.crawled` and `job.completed` events to EventBridge. Never reads/writes Postgres directly.            |
| **EventBridge**         | Routes crawler events to per-type SQS queues                                                                                                                                |
| **Lambda Consumer**     | Triggered by `page.crawled` via SQS. Persists page data to Postgres, updates job progress, publishes to Redis `job:{id}` channel.                                           |
| **Lambda Generator**    | Triggered by `job.completed` via SQS. Builds llms.txt from pages table, writes to S3, archives pages, cleans up Postgres, publishes completion to Redis `job:{id}` channel. |
| **Lambda Monitor**      | Cron (every 2 min), detects stale jobs via `jobs.updated_at`, queries Postgres for visited URLs, re-discovers pending URLs, re-enqueues to SQS (jobs).                      |
| **Redis (ElastiCache)** | Pub/Sub per job ID. Consumer + Generator publish progress/completion. NestJS subscribes only for jobs with active SSE listeners. Fire-and-forget — no persistence needed.   |
| **Postgres (RDS)**      | Source of truth: users, sessions, jobs, pages (written by consumer only)                                                                                                    |
| **S3**                  | Final llms.txt files, archived page data                                                                                                                                    |

---

## 4. Crawling Engine

### Strategy

- **Default: Cheerio** (axios HTTP fetch + cheerio HTML parse) — benchmarked ~5x faster than Playwright across 9 sites
- **Fallback: Playwright** — crawler fetches root page with Cheerio first; if `isSpa()` returns true, the entire crawl restarts using Playwright. Detection is once per job, not per-page.

### Benchmark Summary

Tested against 9 server-rendered sites at unlimited depth/pages:

| Metric         | Cheerio                             | Playwright                                |
| -------------- | ----------------------------------- | ----------------------------------------- |
| Avg speed      | **~5x faster**                      | Baseline                                  |
| Page discovery | Equal or -5-15%                     | Slightly more on some sites               |
| Bot detection  | Rarely blocked                      | Blocked on some sites (e.g. printify.com) |
| Memory         | In-process (spikes on large crawls) | Chromium separate process (200-500MB)     |

Full benchmark data: `docs/benchmark_cheerio_vs_playwright.md`

### BFS Crawl Algorithm

1. Fetch root page, extract title, meta description, all `<a href>` links
2. Filter links: same-origin only, skip assets/binary extensions, skip noisy paths (`/api`, `/admin`, `/login`)
3. Add unseen links to next BFS level
4. Repeat level by level up to maxDepth
5. Concurrency controlled via `p-limit` (default 5 for Cheerio, 3 for Playwright)

### SPA Detection Heuristic

```
isSpa = (hasSpaRoot OR hasModuleScript) AND NOT hasStaticNavLinks
```

Where:

- `hasSpaRoot`: `#root`, `#app`, `#__next`, `#__nuxt`, `[data-reactroot]`
- `hasModuleScript`: `<script type="module">`
- `hasStaticNavLinks`: `<a href="/">` style links (excluding asset extensions)

---

## 5. Crawl Lifecycle & Resume

Lambda workers can be killed at any time (timeout, OOM, throttle). There is no SIGTERM on Lambda timeout. The architecture assumes the worker can die at any moment.

### Data Flow

The crawler never reads or writes Postgres directly. It is stateful in memory and emits events to EventBridge:

```
Crawler Lambda (stateful in memory)
  │
  ├── receives SQS message: { jobId, urls: [...] }
  │     - First run: urls = [rootUrl]
  │     - Resume: urls = [pending URLs from monitor]
  │
  ├── initializes in-memory state:
  │     - visited: Set (empty on first run, or seeded from message)
  │     - pending: Queue (from urls in message)
  │
  ├── BFS loop:
  │     ├── pop URL from pending
  │     ├── fetch + parse page
  │     ├── emit to EventBridge: page.crawled { jobId, url, title, desc, depth, newUrls }
  │     │     (if newUrls > 200, split into multiple events to stay under 256KB limit)
  │     ├── add newUrls to pending (if not in visited)
  │     ├── add current URL to visited
  │     └── repeat until pending is empty
  │
  └── emit to EventBridge: job.completed { jobId }
```

EventBridge routes events to SQS queues → Lambda consumers:

**Consumer Lambda** (triggered by `page.crawled` via SQS):

- Inserts page data into Postgres `pages` table (upsert on `job_id, url` to handle SQS at-least-once delivery)
- Inserts `newUrls` into Postgres `discovered_urls` table (for resurrection — the full link frontier)
- Updates `jobs.updated_at` (acts as implicit heartbeat)
- Publishes to Redis: `redis.publish("job:{jobId}", { pagesFound })`

**Generator Lambda** (triggered by `job.completed` via SQS):

- Reads all pages from Postgres, generates llms.txt
- Writes llms.txt + pages archive to S3
- Cleans up Postgres (DELETE pages for job)
- Publishes to Redis: `redis.publish("job:{jobId}", { status: "completed", downloadUrl })`

### Heartbeat via Message Flow

There is no separate heartbeat mechanism. The continuous flow of page-result messages to SQS serves as the liveness signal. The consumer updates `jobs.updated_at` on every page write. If messages stop flowing, `updated_at` goes stale, and the monitor detects it.

### Death Detection & Resurrection

1. **Monitor Lambda** runs every 2 minutes (CloudWatch cron)
2. Queries: `SELECT * FROM jobs WHERE status = 'running' AND updated_at < now() - interval '3 minutes'`
3. For each stale job:
   a. Query visited URLs: `SELECT url FROM pages WHERE job_id = $1`
   b. Query all discovered URLs: `SELECT url FROM discovered_urls WHERE job_id = $1`
   c. Compute pending: discovered minus visited
   d. If visited + pending exceed SQS 256KB message limit, store in S3 and pass an S3 key in the message instead
   e. Enqueue to SQS (jobs): `{ jobId, urls: [pending...], visited: [already crawled...] }` or `{ jobId, stateS3Key: "..." }`
   f. Increment `jobs.invocations`
4. New crawler Lambda picks up the message, loads state (from message or S3), and resumes

### Why the Crawler Receives Visited URLs on Resume

On first run, the crawler starts with an empty visited set. On resume, the monitor includes the visited URLs so the crawler can seed its in-memory visited set and avoid re-crawling pages already in Postgres. For large jobs (5000+ URLs), state is passed via S3 reference to avoid the 256KB SQS message limit.

### Lambda Configuration

- Timeout: 15 minutes (Lambda maximum)
- Memory: 1024 MB (Cheerio) / 2048 MB (Playwright)
- Monitor death threshold: 3 minutes (no page-results messages = stale)

### Failure Limits

- Max invocations per job: 10 (configurable)
- After max retries: job marked as `failed`
- Lost work per failure: pages discovered in memory but not yet pushed to SQS (typically a few URLs from the current BFS frontier)

### Known Limitations (MVP)

- **robots.txt**: not respected in v1. To be added before production traffic.
- **Rate limiting**: signup gate prevents anonymous abuse. Per-user concurrent job limits to be added post-MVP.
- **OAuth**: single provider per user account. Multi-provider linking is a future enhancement.

---

## 6. Database Schema

Postgres on RDS. Managed via Prisma ORM with migrations.

```sql
-- Users (authenticated)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE,
  password_hash   TEXT,           -- null for OAuth/magic-link-only users
  oauth_provider  TEXT,           -- 'google', 'github', or null
  oauth_id        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Anonymous sessions (cookie-tracked)
CREATE TABLE anon_sessions (
  id              UUID PRIMARY KEY,  -- matches the cookie value
  user_id         UUID REFERENCES users(id),  -- null until signup, then linked
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Crawl jobs
CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),        -- null if anonymous
  anon_session_id UUID REFERENCES anon_sessions(id), -- set if anonymous
  root_url        TEXT NOT NULL,
  max_depth       INT DEFAULT 3,
  max_pages       INT DEFAULT 200,
  status          TEXT DEFAULT 'pending',  -- pending | running | completed | failed
  s3_key          TEXT,                    -- path to final llms.txt
  invocations     INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Crawled pages (written by consumer, archived after completion)
CREATE TABLE pages (
  id              SERIAL PRIMARY KEY,
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  title           TEXT,
  description     TEXT,
  depth           INT,
  crawled_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, url)  -- dedup for SQS at-least-once delivery
);

-- All URLs discovered during crawl (written by consumer from newUrls in events).
-- Used by the monitor to reconstruct the pending frontier on resurrection.
-- Without this, a depth-1 re-crawl of root would miss deep links.
CREATE TABLE discovered_urls (
  id              SERIAL PRIMARY KEY,
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  UNIQUE(job_id, url)
);

CREATE INDEX idx_pages_job ON pages(job_id);
CREATE INDEX idx_discovered_job ON discovered_urls(job_id);
CREATE INDEX idx_jobs_status ON jobs(status, updated_at);
CREATE INDEX idx_jobs_anon ON jobs(anon_session_id);
CREATE INDEX idx_jobs_user ON jobs(user_id);
```

### Lifecycle

1. **During crawl**: consumer inserts into `pages` and `discovered_urls` as events arrive
2. **On completion**: Generator Lambda reads all pages, builds llms.txt, writes to S3, archives pages as JSON to S3
3. **Cleanup**: DELETE from `pages` and `discovered_urls` for the job. `jobs` row stays (with `s3_key` pointing to the result)

---

## 7. Event System

EventBridge is the single event bus. The crawler emits all events to EventBridge. Rules route them to SQS queues that trigger consumers.

### EventBridge Events

All events go to a custom event bus `llm-crawler-events`.

| Event           | DetailType     | Producer                                      | Payload |
| --------------- | -------------- | --------------------------------------------- | ------- |
| `page.crawled`  | Crawler Lambda | `{ jobId, url, title, desc, depth, newUrls }` |
| `job.completed` | Crawler Lambda | `{ jobId }`                                   |

**Event size limit:** EventBridge has a 256KB max per event. If a page has >200 discovered URLs, the crawler splits `newUrls` across multiple `page.crawled` events.

### EventBridge → SQS Routing

| Rule matches    | Target SQS queue  | Consumer         |
| --------------- | ----------------- | ---------------- |
| `page.crawled`  | `crawl-pages`     | Consumer Lambda  |
| `job.completed` | `crawl-completed` | Generator Lambda |

### SQS Queues

| Queue             | Producer                           | Consumer         | Purpose             |
| ----------------- | ---------------------------------- | ---------------- | ------------------- |
| `crawl-jobs`      | NestJS API (new), Monitor (resume) | Crawler Lambda   | Job dispatch        |
| `crawl-pages`     | EventBridge rule                   | Consumer Lambda  | Page persistence    |
| `crawl-completed` | EventBridge rule                   | Generator Lambda | llms.txt generation |

### Redis Pub/Sub (Real-Time Progress)

Consumer and Generator Lambdas publish to Redis after processing:

| Channel       | Publisher        | Payload                              | Subscriber             |
| ------------- | ---------------- | ------------------------------------ | ---------------------- |
| `job:{jobId}` | Consumer Lambda  | `{ type: "progress", pagesFound }`   | NestJS (if SSE active) |
| `job:{jobId}` | Generator Lambda | `{ type: "completed", downloadUrl }` | NestJS (if SSE active) |

NestJS subscribes to `job:{jobId}` only when a client opens an SSE connection for that job. On SSE disconnect, it unsubscribes. If nobody is listening, Redis messages are discarded — zero cost.

No separate heartbeat — `jobs.updated_at` is updated by the consumer on every page write, serving as the implicit liveness signal for the monitor.

### DLQ Strategy

Each SQS queue has a Dead Letter Queue. Messages that fail 3 times go to DLQ. CloudWatch alarm on DLQ depth > 0.

---

## 8. Authentication

### JWT Strategy

- Access token: JWT in httpOnly secure cookie, 15-minute expiry
- Refresh token: longer-lived JWT in httpOnly secure cookie, 7-day expiry
- Token payload: `{ sub: userId, email, iat, exp }`

### Anonymous Flow

1. On first visit, API sets a `session_id` httpOnly cookie (UUID)
2. Creates `anon_sessions` row
3. Jobs created by anonymous users reference `anon_session_id`
4. On signup: `anon_sessions.user_id` is set, all jobs with that `anon_session_id` are updated to set `user_id`

### Auth Methods

| Method               | Implementation                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| **Email + password** | bcrypt hash, NestJS Passport local strategy                            |
| **OAuth**            | Passport Google/GitHub strategies, store `oauth_provider` + `oauth_id` |
| **Magic link**       | Generate signed JWT with email, send via SES, verify on click          |

### Signup Gate

- First job: allowed anonymously
- Second job attempt: API returns `401` with `{ reason: 'signup_required' }`
- Frontend shows signup modal
- After signup, anonymous session is linked and user proceeds

---

## 9. API Endpoints

### Public

| Method | Path                   | Description                                     |
| ------ | ---------------------- | ----------------------------------------------- |
| `POST` | `/api/jobs`            | Create a crawl job (anonymous or authenticated) |
| `GET`  | `/api/jobs/:id`        | Get job status + progress                       |
| `GET`  | `/api/jobs/:id/result` | Get presigned S3 URL for llms.txt download      |

### Authenticated

| Method | Path                   | Description              |
| ------ | ---------------------- | ------------------------ |
| `GET`  | `/api/jobs`            | List user's past jobs    |
| `POST` | `/api/auth/signup`     | Email + password signup  |
| `POST` | `/api/auth/login`      | Email + password login   |
| `GET`  | `/api/auth/google`     | OAuth redirect (Google)  |
| `GET`  | `/api/auth/github`     | OAuth redirect (GitHub)  |
| `POST` | `/api/auth/magic-link` | Request magic link email |
| `GET`  | `/api/auth/verify`     | Verify magic link token  |
| `POST` | `/api/auth/refresh`    | Refresh access token     |
| `POST` | `/api/auth/logout`     | Clear tokens             |

### Real-Time Progress (SSE)

Frontend opens `GET /api/jobs/:id/stream` (Server-Sent Events). NestJS subscribes to Redis `job:{jobId}` and relays events:

```
event: progress
data: {"pagesFound": 847}

event: progress
data: {"pagesFound": 848}

event: completed
data: {"pagesFound": 1203, "downloadUrl": "https://s3-presigned-url/llms.txt"}
```

On SSE disconnect, NestJS unsubscribes from Redis. When user reconnects (or refreshes), `GET /api/jobs/:id` returns current state from Postgres as a fallback.

---

## 10. Frontend (React SPA)

### Pages

| Route        | Description                          |
| ------------ | ------------------------------------ |
| `/`          | Landing page with URL input form     |
| `/jobs/:id`  | Job progress + result view           |
| `/dashboard` | Authenticated: list of past crawls   |
| `/login`     | Auth page (email, OAuth, magic link) |

### Key Behaviors

- **Progress view**: SSE connection to `/api/jobs/:id/stream`, shows animated counter + pages found. Falls back to polling `GET /api/jobs/:id` on reconnect.
- **Result view**: llms.txt rendered in monospace textarea, copy + download buttons
- **Anonymous tracking**: stores `session_id` cookie on first job creation
- **Signup gate**: intercepted at second job attempt, shows auth modal, resumes after signup

### Stack

- React (Vite build)
- Tailwind CSS
- React Router for client-side routing
- Hosted on S3, served via CloudFront

---

## 11. S3 Structure

```
llm-crawler-results/
  ├── results/
  │   └── {jobId}/
  │       ├── llms.txt          # final output
  │       └── pages.json        # archived page data
  └── static/                   # React app (CloudFront origin)
      ├── index.html
      ├── assets/
      └── ...
```

### Lifecycle Rules

- `results/` objects: transition to Infrequent Access after 30 days, Glacier after 90 days
- Presigned URLs: 24-hour expiry

---

## 12. Repository Structure

Monorepo with npm workspaces. Shared types and Prisma client across all packages.

```
llm-crawler/
├── packages/
│   ├── api/            # NestJS (ECS Fargate) — auth, job CRUD, SSE
│   ├── web/            # React SPA (CloudFront) — Vite + Tailwind
│   ├── crawler/        # Lambda: BFS crawler (Cheerio/Playwright)
│   ├── consumer/       # Lambda: persists pages + discovered_urls, Redis pub
│   ├── generator/      # Lambda: builds llms.txt, writes S3, cleanup
│   ├── monitor/        # Lambda: resurrection cron
│   └── shared/         # PageData types, Prisma client, utils
├── infra/              # Terraform
├── docs/
├── package.json        # workspace root
└── turbo.json          # Turborepo config
```

---

## 13. Infrastructure (Terraform)

### Resources

| Resource                      | Service                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| VPC + subnets                 | Networking                                                                  |
| RDS Postgres                  | Database                                                                    |
| ECS Fargate cluster + service | NestJS API                                                                  |
| ECR repository                | NestJS container image                                                      |
| ElastiCache Redis             | Pub/Sub for real-time progress to NestJS                                    |
| Lambda functions (4)          | Crawler, Consumer, Generator, Monitor                                       |
| SQS queues (3) + DLQs         | Job dispatch (crawl-jobs), pages (crawl-pages), completed (crawl-completed) |
| EventBridge bus + rules       | Routes crawler events to SQS queues                                         |
| S3 buckets (2)                | Results + React app static hosting                                          |
| CloudFront distribution       | CDN for React app                                                           |
| ACM certificate               | HTTPS                                                                       |
| IAM roles + policies          | Per-service permissions                                                     |
| CloudWatch alarms             | DLQ depth, Lambda errors, ECS health                                        |

### Environments

- `dev` — smaller instances, single-AZ RDS
- `prod` — multi-AZ RDS, autoscaling ECS, CloudWatch dashboards

---

## 14. CI/CD (GitHub Actions)

### Pipelines

**On pull request:**

- Lint + type check
- Unit tests
- `terraform plan` (diff shown in PR comment)

**On merge to main:**

- Build React app → upload to S3, invalidate CloudFront
- Build NestJS container → push to ECR, update ECS service
- Package Lambda functions → update Lambda code
- Run Prisma migrations against RDS
- `terraform apply` (if infra changes)

---

## 15. llms.txt Generation

### Format (per spec)

```markdown
# Site Title

> Site description from root page meta

## Docs

- [Page Title](https://example.com/docs/page): Page description

## Blog

- [Post Title](https://example.com/blog/post): Post description
```

### Grouping Logic

1. Root page becomes the `# H1` title (extracted from `<title>` with "Site Name | Page" pattern cleaning)
2. Root page `<meta description>` becomes the `> blockquote`
3. Non-root pages grouped by first URL path segment (e.g. `/docs/foo` → "Docs" section)
4. Sections sorted: docs, api, blog, about first, then alphabetical
5. Each page rendered as `- [title](url): description`
