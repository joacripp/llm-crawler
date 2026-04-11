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
4. Sees real-time progress (pages found, current URL) via polling
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
       │ API calls
       ▼
┌──────────────┐     ┌──────────┐     ┌─────────────────┐
│   NestJS     │────►│   SQS    │────►│  Lambda Crawler  │
│  (ECS Fargate)│    │  (jobs)  │     │  (Cheerio/PW)    │
│              │     └──────────┘     └────────┬─────────┘
│  - Auth API  │                               │
│  - Job API   │     ┌──────────────┐          │ writes pages
│  - Progress  │     │ EventBridge  │◄─────────┤ emits events
│    polling   │     └──────┬───────┘          │
└──────┬───────┘            │                  ▼
       │              ┌─────┴──────────┐  ┌─────────┐
       │              │ SQS queues     │  │Postgres │
       │              │ - progress     │  │ (RDS)   │
       │              │ - job-completed│  └─────────┘
       │              │ - heartbeat    │
       │              └─────┬──────────┘
       │                    │
       │              ┌─────┴──────────┐
       ▼              │ Consumers      │
  ┌─────────┐         │ - Generator λ  │──► S3 (llms.txt)
  │Postgres │         │ - Monitor λ    │──► SQS (re-enqueue)
  │ (RDS)   │         └────────────────┘
  └─────────┘
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| **React SPA** | UI: URL input, progress display, results viewer, auth screens, dashboard |
| **CloudFront** | Serves React app from S3, caches static assets at the edge |
| **NestJS API** | Auth (JWT), job CRUD, progress polling endpoint, presigned S3 URLs |
| **SQS (jobs)** | Decouples job submission from crawl execution |
| **Lambda Crawler** | Pulls from SQS, crawls pages, writes to Postgres, emits events |
| **EventBridge** | Routes crawler events to per-type SQS queues |
| **Lambda Generator** | Triggered by job-completed event, builds llms.txt from pages, writes to S3, cleans up Postgres |
| **Lambda Monitor** | Cron (every 2 min), detects stale jobs, re-enqueues to SQS |
| **Postgres (RDS)** | Source of truth: users, sessions, jobs, pages, pending_urls |
| **S3** | Final llms.txt files, archived page data |

---

## 4. Crawling Engine

### Strategy

- **Default: Cheerio** (axios HTTP fetch + cheerio HTML parse) — benchmarked ~5x faster than Playwright across 9 sites
- **Fallback: Playwright** — crawler fetches root page with Cheerio first; if `isSpa()` returns true, the entire crawl restarts using Playwright. Detection is once per job, not per-page.

### Benchmark Summary

Tested against 9 server-rendered sites at unlimited depth/pages:

| Metric | Cheerio | Playwright |
|---|---|---|
| Avg speed | **~5x faster** | Baseline |
| Page discovery | Equal or -5-15% | Slightly more on some sites |
| Bot detection | Rarely blocked | Blocked on some sites (e.g. printify.com) |
| Memory | In-process (spikes on large crawls) | Chromium separate process (200-500MB) |

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

## 5. Checkpoint & Resume

Lambda workers can be killed at any time (timeout, OOM, throttle). There is no SIGTERM on Lambda timeout. The architecture assumes the worker can die at any moment.

### How It Works

1. **Continuous writes**: after each page crawl, the worker atomically writes to Postgres in a transaction:
   - INSERT the crawled page into `pages`
   - DELETE the URL from `pending_urls`
   - INSERT newly discovered URLs into `pending_urls`
2. **Heartbeat**: worker emits a `crawl.heartbeat` event to EventBridge every ~30 seconds, which also updates `jobs.updated_at`
3. **Death detection**: Monitor Lambda runs every 2 minutes, queries for jobs where `status = 'running'` and `updated_at` is older than 3 minutes
4. **Resurrection**: stale jobs are re-enqueued to SQS with incremented `invocations` count
5. **Resume**: new Lambda loads visited URLs and pending queue from Postgres, continues BFS from where it stopped

### Lambda Configuration

- Timeout: 15 minutes (Lambda maximum)
- Memory: 1024 MB (Cheerio) / 2048 MB (Playwright)
- Heartbeat interval: 30 seconds
- Monitor death threshold: 3 minutes (> 6 missed heartbeats)

### Failure Limits

- Max invocations per job: 10 (configurable)
- After max retries: job marked as `failed`
- Lost work per failure: at most the current in-flight page (single page, not a batch)

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

-- Crawled pages (active during crawl, archived after)
CREATE TABLE pages (
  id              SERIAL PRIMARY KEY,
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  title           TEXT,
  description     TEXT,
  depth           INT,
  crawled_at      TIMESTAMPTZ DEFAULT now()
);

-- BFS queue (URLs discovered but not yet crawled)
CREATE TABLE pending_urls (
  id              SERIAL PRIMARY KEY,
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  depth           INT
);

CREATE INDEX idx_pages_job ON pages(job_id);
CREATE INDEX idx_pending_job ON pending_urls(job_id);
CREATE INDEX idx_jobs_status ON jobs(status, updated_at);
CREATE INDEX idx_jobs_anon ON jobs(anon_session_id);
CREATE INDEX idx_jobs_user ON jobs(user_id);
```

### Lifecycle

1. **During crawl**: `pages` and `pending_urls` grow as the crawler works
2. **On completion**: Generator Lambda reads all pages, builds llms.txt, writes to S3, archives pages as JSON to S3
3. **Cleanup**: DELETE from `pages` and `pending_urls` for the job. `jobs` row stays (with `s3_key` pointing to the result)

---

## 7. Event System

### EventBridge Events

All events go to a custom event bus `llm-crawler-events`.

| Event | DetailType | Payload | Purpose |
|---|---|---|---|
| Page crawled | `page.crawled` | `{ jobId, pagesFound }` | Progress tracking |
| Heartbeat | `crawl.heartbeat` | `{ jobId }` | Liveness signal |
| Job completed | `job.completed` | `{ jobId }` | Triggers llms.txt generation |

Events are intentionally thin — just notifications. Consumers query Postgres for details.

### SQS Routing

EventBridge rules route events to dedicated SQS queues:

| Queue | Source event | Consumer |
|---|---|---|
| `crawl-jobs` | API (direct) | Crawler Lambda |
| `crawl-progress` | `page.crawled` | (consumed by API for polling cache, optional) |
| `crawl-completed` | `job.completed` | Generator Lambda |
| `crawl-heartbeat` | `crawl.heartbeat` | (updates jobs.updated_at via small Lambda or direct DB write) |

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

| Method | Implementation |
|---|---|
| **Email + password** | bcrypt hash, NestJS Passport local strategy |
| **OAuth** | Passport Google/GitHub strategies, store `oauth_provider` + `oauth_id` |
| **Magic link** | Generate signed JWT with email, send via SES, verify on click |

### Signup Gate

- First job: allowed anonymously
- Second job attempt: API returns `401` with `{ reason: 'signup_required' }`
- Frontend shows signup modal
- After signup, anonymous session is linked and user proceeds

---

## 9. API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/jobs` | Create a crawl job (anonymous or authenticated) |
| `GET` | `/api/jobs/:id` | Get job status + progress |
| `GET` | `/api/jobs/:id/result` | Get presigned S3 URL for llms.txt download |

### Authenticated

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/jobs` | List user's past jobs |
| `POST` | `/api/auth/signup` | Email + password signup |
| `POST` | `/api/auth/login` | Email + password login |
| `GET` | `/api/auth/google` | OAuth redirect (Google) |
| `GET` | `/api/auth/github` | OAuth redirect (GitHub) |
| `POST` | `/api/auth/magic-link` | Request magic link email |
| `GET` | `/api/auth/verify` | Verify magic link token |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Clear tokens |

### Progress Polling

Frontend polls `GET /api/jobs/:id` every 2-3 seconds while status is `running`. Response:

```json
{
  "id": "abc-123",
  "rootUrl": "https://example.com",
  "status": "running",
  "pagesFound": 847,
  "updatedAt": "2026-04-10T12:03:04Z"
}
```

When `status: "completed"`:

```json
{
  "id": "abc-123",
  "status": "completed",
  "pagesFound": 1203,
  "downloadUrl": "https://s3-presigned-url/llms.txt"
}
```

---

## 10. Frontend (React SPA)

### Pages

| Route | Description |
|---|---|
| `/` | Landing page with URL input form |
| `/jobs/:id` | Job progress + result view |
| `/dashboard` | Authenticated: list of past crawls |
| `/login` | Auth page (email, OAuth, magic link) |

### Key Behaviors

- **Progress view**: polls API every 2-3s, shows animated counter + current URL being crawled
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

## 12. Infrastructure (Terraform)

### Resources

| Resource | Service |
|---|---|
| VPC + subnets | Networking |
| RDS Postgres | Database |
| ECS Fargate cluster + service | NestJS API |
| ECR repository | NestJS container image |
| Lambda functions (4) | Crawler, Generator, Monitor, Heartbeat updater |
| SQS queues (4) + DLQs | Job dispatch, progress, completed, heartbeat |
| EventBridge bus + rules | Event routing |
| S3 buckets (2) | Results + React app static hosting |
| CloudFront distribution | CDN for React app |
| ACM certificate | HTTPS |
| IAM roles + policies | Per-service permissions |
| CloudWatch alarms | DLQ depth, Lambda errors, ECS health |

### Environments

- `dev` — smaller instances, single-AZ RDS
- `prod` — multi-AZ RDS, autoscaling ECS, CloudWatch dashboards

---

## 13. CI/CD (GitHub Actions)

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

## 14. llms.txt Generation

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
