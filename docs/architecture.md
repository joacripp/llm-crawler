# Architecture

## Overview

The llms.txt Generator is an event-driven crawling pipeline on AWS. A user submits a URL, a Lambda worker crawls the site, and the result is a structured llms.txt file stored in S3.

The core design constraint: **a single crawl can run for 15+ minutes and consume hundreds of MBs of memory.** A monolithic backend would crash under concurrent users. The solution decouples crawling into stateless Lambda workers with continuous checkpointing to Postgres and event-driven coordination via EventBridge + SQS.

---

## System diagram

```mermaid
graph TB
    subgraph Frontend
        User([User]) --> CF[CloudFront]
        CF --> SPA[React SPA<br/>S3 bucket]
        CF --> |/api/*| ALB[ALB]
    end

    subgraph API Layer
        ALB --> API[NestJS API<br/>ECS Fargate]
        API --> |create job| JobsQ[SQS: crawl-jobs]
        API --> |SSE stream| Redis[(Redis<br/>ElastiCache)]
    end

    subgraph Crawl Pipeline
        JobsQ --> Crawler[Crawler Lambda<br/>container image<br/>Cheerio / Playwright]
        Crawler --> |page.crawled| EB[EventBridge]
        Crawler --> |job.completed| EB
        EB --> |page.crawled| PagesQ[SQS: crawl-pages]
        EB --> |job.completed| CompQ[SQS: crawl-completed]
        PagesQ --> Consumer[Consumer Lambda]
        CompQ --> Generator[Generator Lambda]
    end

    subgraph Persistence
        Consumer --> PG[(Postgres<br/>RDS)]
        Consumer --> Redis
        Generator --> PG
        Generator --> S3[(S3: results)]
        Generator --> Redis
        Generator --> SES[SES: email]
    end

    subgraph Resilience
        Monitor[Monitor Lambda<br/>cron every 2min] --> PG
        Monitor --> JobsQ
        Monitor --> CompQ
        PagesQ --> PagesDLQ[DLQ: pages]
        CompQ --> CompDLQ[DLQ: completed]
        JobsQ --> JobsDLQ[DLQ: jobs]
    end

    style Crawler fill:#3b82f6,color:#fff
    style Consumer fill:#6366f1,color:#fff
    style Generator fill:#6366f1,color:#fff
    style Monitor fill:#f59e0b,color:#fff
    style API fill:#10b981,color:#fff
    style SPA fill:#10b981,color:#fff
    style PagesDLQ fill:#ef4444,color:#fff
    style CompDLQ fill:#ef4444,color:#fff
    style JobsDLQ fill:#ef4444,color:#fff
```

---

## Job lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant API as NestJS API
    participant SQS as SQS (jobs)
    participant C as Crawler Lambda
    participant EB as EventBridge
    participant Con as Consumer Lambda
    participant Gen as Generator Lambda
    participant DB as Postgres
    participant S3 as S3

    U->>API: POST /api/jobs { url }
    API->>DB: INSERT job (status=pending)
    API->>SQS: SendMessage { jobId, urls: [url] }
    API-->>U: { id, status: pending }

    SQS->>C: Invoke
    Note over C: Probe for SPA detection
    loop For each page (BFS)
        C->>EB: page.crawled { url, title, newUrls }
        EB->>Con: via SQS (pages)
        Con->>DB: UPSERT page + discovered_urls
        Con->>DB: UPDATE job status=running
        Con-->>U: Redis pub → SSE → browser
    end
    C->>EB: job.completed { pagesEmitted: N }

    EB->>Gen: via SQS (completed)
    Note over Gen: Wait until pages.count >= pagesEmitted
    Gen->>DB: SELECT pages
    Gen->>S3: PUT llms.txt + pages.json
    Gen->>DB: UPDATE job status=completed
    Gen->>DB: DELETE pages + discovered_urls
    Gen-->>U: Redis pub → SSE → browser
    Gen->>U: SES email (if logged in)
```

---

## Database schema

```mermaid
erDiagram
    users {
        uuid id PK
        text email UK
        text password_hash
        text oauth_provider
        text oauth_id
        timestamp created_at
    }

    anon_sessions {
        uuid id PK
        uuid user_id FK
        timestamp created_at
    }

    jobs {
        uuid id PK
        uuid user_id FK
        uuid anon_session_id FK
        text root_url
        int max_depth
        int max_pages
        text status
        text s3_key
        int pages_found
        int invocations
        int pages_at_last_invocation
        int no_progress_strikes
        timestamp created_at
        timestamp updated_at
    }

    pages {
        serial id PK
        uuid job_id FK
        text url
        text title
        text description
        int depth
        timestamp crawled_at
    }

    discovered_urls {
        serial id PK
        uuid job_id FK
        text url
    }

    users ||--o{ jobs : "creates"
    users ||--o{ anon_sessions : "links to"
    anon_sessions ||--o{ jobs : "creates"
    jobs ||--o{ pages : "contains"
    jobs ||--o{ discovered_urls : "tracks"
```

**Lifecycle of `pages` and `discovered_urls`:** these tables are transient. The consumer writes to them during a crawl; the generator reads `pages` to build llms.txt, then deletes both. After completion, only the `jobs` row persists (with `s3_key` pointing to the result and `pages_found` storing the final count).

---

## Key design decisions

### Event-driven with checkpoint/resume

A single crawl can run for 15+ minutes and consume hundreds of MBs. Rather than a monolithic backend that crashes under load, the architecture decouples crawling into Lambda workers with continuous checkpointing to Postgres.

Each page is persisted individually as it's crawled — not batched at the end. If the Lambda dies at page 150 of 200, those 150 pages are safe in Postgres. The resurrection monitor picks up the remaining 50.

### Lambda hard-kill resilience

Lambda does NOT send SIGTERM on timeout — it kills the process instantly. The architecture assumes the worker can die at any moment:

- **State is in the database, not in memory.** The crawler emits events per page; the consumer persists them immediately.
- **The resurrection monitor** (cron every 2 min) queries for jobs with `status='running'` and `updated_at` older than 3 minutes. It computes `pending = discovered_urls - pages` (the URLs we found but haven't crawled yet) and re-enqueues them.
- **Invocation tracking** (`invocations` column) prevents infinite loops — after 10 attempts, the job is marked `failed`.

### Generator/consumer sync via `pagesEmitted`

The `page.crawled` and `job.completed` events flow through different SQS queues. SQS provides no ordering guarantee between queues, so the generator can run before all pages are persisted.

**The problem:** if the crawler emits 5 pages and only 2 are persisted when the generator runs, it builds an incomplete llms.txt.

**The fix:** the crawler passes `pagesEmitted: N` on the `job.completed` event — the exact number of `page.crawled` events it sent. The generator compares this against `pages.count` in the database:

```
if pages.count < pagesEmitted → throw → SQS retries after visibility timeout
if pages.count >= pagesEmitted → proceed to build llms.txt
```

The completed queue has a 30-second visibility timeout (not the default 300s) so retries happen quickly.

**Idempotency:** if the job is already `completed` or `failed` when the generator runs (a stale SQS retry), it skips silently instead of throwing.

### Progress-based failure detection

The monitor can't distinguish "Lambda died mid-flight" from "this job will never succeed" (e.g., SPA false-positive causing Playwright to crash every attempt). A simple retry counter wastes ~30 minutes before giving up.

**The fix:** track `pages_at_last_invocation` and `no_progress_strikes`:

```
for each stale job:
  currentPages = count(pages WHERE job_id)
  if invocations > 0 AND currentPages <= pages_at_last_invocation:
    strikes++
    if strikes >= 2: mark failed (give up after ~6 min)
  else:
    strikes = 0 (progress detected)
  re-enqueue with updated counts
```

### Consumer status protection

The consumer processes `page.crawled` events and updates the job status. But these events can arrive after the generator has already marked the job `completed` (different queues, no ordering).

**The fix:** the consumer uses `updateMany` with a `WHERE status='pending'` / `WHERE status='running'` clause. It never matches `completed` or `failed` jobs, so it can't clobber a terminal status.

### Per-record error handling

The consumer's SQS event source has `batch_size=10`. Previously, one bad record crashed the entire batch — SQS retried all 10, and if the bad one kept failing, all 10 went to the DLQ.

**The fix:** per-record try/catch, returning `SQSBatchResponse` with `batchItemFailures`. Only the failed record gets retried. Requires `function_response_types = ["ReportBatchItemFailures"]` on the Lambda event source mapping.

---

## Queue topology

```
SQS: crawl-jobs (visibility: 960s, DLQ after 3 receives)
  └── Triggers: Crawler Lambda (batch_size=1)

SQS: crawl-pages (visibility: 60s, DLQ after 3 receives)
  └── Triggers: Consumer Lambda (batch_size=10, ReportBatchItemFailures)

SQS: crawl-completed (visibility: 30s, DLQ after 5 receives)
  └── Triggers: Generator Lambda (batch_size=1)
```

**Why different visibility timeouts:**

- `crawl-jobs` (960s = 16 min): the crawler Lambda timeout is 15 min. Visibility must exceed Lambda timeout to prevent re-delivery while still running.
- `crawl-pages` (60s): the consumer runs in <5s per batch. 60s gives headroom for cold starts.
- `crawl-completed` (30s): the generator runs in <5s. Short timeout so `pagesEmitted` sync retries happen quickly (the generator may need 1-2 retries for the consumer to catch up).

---

## Monitoring

### CloudWatch dashboards

| Dashboard                    | Purpose                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `llm-crawler-dev-operations` | Queue backlog, DLQ depth, max queue age, Lambda errors/throttles, ECS tasks, API 5xx + latency |
| `llm-crawler-dev-pipeline`   | Queue age over time, depth (visible + in-flight), per-Lambda duration, concurrent executions   |
| `llm-crawler-dev-database`   | RDS CPU/memory/IOPS/connections, Redis CPU/memory/evictions                                    |
| `llm-crawler-dev-cost`       | Daily Lambda invocations, avg duration, crawler memory, ECS utilization, S3 bucket size        |

### Alarms (SNS email)

| Alarm                | Condition                      |
| -------------------- | ------------------------------ |
| DLQ not-empty (x3)   | Any message in a DLQ for 1 min |
| Lambda errors (x4)   | >5 errors in 10 min            |
| ECS no running tasks | <1 task for 2 min              |

---

## Infrastructure

All resources are managed by Terraform, split into 11 modules:

| Module       | Resources                                           |
| ------------ | --------------------------------------------------- |
| `networking` | VPC, public/private subnets, security groups        |
| `database`   | RDS Postgres 16, parameter group                    |
| `redis`      | ElastiCache Redis 7.1                               |
| `storage`    | S3 buckets (results + SPA), lifecycle rules         |
| `queues`     | 3 SQS queues + 3 DLQs                               |
| `events`     | EventBridge bus + routing rules                     |
| `lambdas`    | 4 Lambda functions, IAM role, event source mappings |
| `api`        | ECS cluster, task def, ALB, target group, Route 53  |
| `cdn`        | CloudFront distribution, Route 53                   |
| `ses`        | Domain verification, DKIM records                   |
| `monitoring` | 4 dashboards, 8 alarms, SNS topic                   |

State is stored in S3 (`llm-crawler-terraform-state`) with DynamoDB locking.
