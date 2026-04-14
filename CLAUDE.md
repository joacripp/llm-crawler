# llms.txt Generator

Automated tool that crawls websites and generates [llms.txt](https://llmstxt.org/) files.

## Architecture

Monorepo (Turborepo + npm workspaces) with 7 packages deployed on AWS.

### Packages

| Package              | Runtime            | Purpose                                                                                                                     |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`    | Library            | Types, Prisma client, Redis pub, URL utils, llms.txt generator, email (SES)                                                 |
| `packages/crawler`   | Lambda (container) | BFS crawler (Cheerio + Playwright for SPAs). Emits events to EventBridge                                                    |
| `packages/consumer`  | Lambda (zip)       | Persists pages to Postgres, publishes progress to Redis. Per-record error handling with SQS partial batch failure reporting |
| `packages/generator` | Lambda (zip)       | Builds llms.txt from pages, uploads to S3, cleans up Postgres, sends completion email                                       |
| `packages/monitor`   | Lambda (zip)       | Cron: detects stale jobs, re-enqueues for resurrection. Progress-based failure detection (2 no-progress strikes → fail)     |
| `packages/api`       | ECS Fargate        | NestJS: auth (email+password, Google OAuth, GitHub OAuth), job CRUD, SSE progress, content proxy                            |
| `packages/web`       | CloudFront/S3      | React SPA: Vite + Tailwind                                                                                                  |

### Event flow

```
User → CloudFront → NestJS API → SQS (jobs) → Crawler Lambda
                                                    ↓
                                              EventBridge
                                              ↓           ↓
                                    SQS (pages)    SQS (completed)
                                         ↓              ↓
                                  Consumer Lambda   Generator Lambda
                                    ↓       ↓           ↓       ↓ → SES email
                                 Postgres  Redis       S3     Redis
                                              ↓                 ↓
                                         NestJS SSE → Frontend
```

### Infrastructure (`infra/`)

Terraform modules: networking, database (RDS Postgres 16), redis (ElastiCache), storage (S3), queues (SQS + DLQs), events (EventBridge), lambdas, api (ECS + ALB), cdn (CloudFront), ses (domain verification + DKIM), monitoring (CloudWatch dashboards + alarms).

## Development

### Prerequisites

- Node.js >= 20.19 (required by Prisma v7 CLI)
- AWS CLI configured
- Terraform (for infra changes)

### Setup

```bash
npm install
npx prisma generate    # REQUIRED before build — generates Prisma client
npm run build
npm run test           # 194 tests across 7 packages
```

### Running locally

```bash
# API (needs DATABASE_URL, REDIS_URL, JOBS_QUEUE_URL, S3_BUCKET, JWT_SECRET env vars)
cd packages/api && npm run start:dev

# Frontend (proxies /api to localhost:3000)
cd packages/web && npm run dev
```

### Linting & Formatting

```bash
npm run lint           # ESLint (flat config, eslint.config.mjs)
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier --write
npm run format:check   # Prettier --check (used in CI)
```

Pre-commit hook runs `eslint --fix` + `prettier --write` on staged files via husky + lint-staged.

## Gotchas & Operational Knowledge

### Prisma

- **Always run `npx prisma generate` after `npm install`** — the Prisma client is generated code, not committed. Build will fail with `Module '"@prisma/client"' has no exported member 'PrismaClient'` if you skip this.
- **Schema at `prisma/schema.prisma`** — shared by all packages. Config at `prisma.config.ts` (repo root).
- **Prisma v7** — uses WASM engine (no native binary, no OpenSSL needed). `@prisma/adapter-pg` for Postgres at runtime. Schema has **no `url` in datasource** — Prisma v7 forbids it when an adapter is in use. Connection URL is supplied via `datasource.url` in `prisma.config.ts` (reads `DATABASE_URL` env var) for CLI commands, and via PrismaPg adapter in `packages/shared/src/prisma.ts` at runtime.
- **ECS Dockerfile runs `prisma migrate deploy` on startup** — applies any unapplied migrations from `prisma/migrations/` to RDS. For schema changes: edit `schema.prisma`, then run `npx prisma migrate dev --name <description>` locally to generate a new timestamped migration in `prisma/migrations/`. Commit it. Next deploy applies it automatically. CI has a `schema-drift-check` job that fails if the schema is edited without a matching migration.

### Lambda Bundling

- **esbuild bundles each Lambda into a single CJS file** — see `.github/workflows/deploy.yml`.
- **All Lambdas use the same esbuild command** — everything bundled inline. Only `@aws-sdk/*` (provided by Lambda runtime) and `playwright-core` are externalized.
- **CJS format, not ESM** — ioredis uses `require("events")` which breaks in ESM bundles. All Lambdas use `--format=cjs`.
- **Prisma v7 WASM engine bundles cleanly** — no native binaries, no special handling needed.

### Crawler / SPA Support

- **Crawler Lambda is a container image** (not a zip) — includes Playwright + `@sparticuz/chromium` for SPA crawling. Dockerfile at `packages/crawler/Dockerfile`.
- **SPA detection**: on first invocation (`!visited && urls.length === 1`), the crawler probes the root URL via axios. `isSpa()` checks for `#root`/`#app` + `<script type="module">` + no static `<a>` links. If SPA → Playwright; else → Cheerio.
- **`--single-process` removed from Chromium args** — causes `browser.newPage` to crash on the 2nd page in Lambda.
- The SPA heuristic has false positives — sites with `<script type="module">` get flagged even if server-rendered (e.g. Vite SSR, Astro).

### Generator / Consumer Sync

- **Generator waits for consumer via `pagesEmitted`** — the crawler passes `pagesEmitted: N` on the `job.completed` event. Generator compares against `pages.count` in DB and throws (SQS retry) if the consumer hasn't caught up.
- **Generator is idempotent** — if the job is already `completed` or `failed`, it skips silently (prevents stale SQS retries from DLQ'ing).
- **Consumer uses `SQSBatchResponse`** with `ReportBatchItemFailures` — one bad record doesn't crash the whole batch.
- **Consumer never clobbers terminal status** — uses `updateMany` with `WHERE status='pending'` / `WHERE status='running'` to avoid resetting `completed`/`failed`.

### CloudFront / Frontend

- **CloudFront has two origins**: S3 (default, serves React SPA) and ALB (`/api/*` path pattern, forwards to NestJS).
- **SPA routing**: CloudFront returns `index.html` for 403/404 errors so React Router works.
- **Content proxy**: `/api/jobs/:id/content` streams S3 content through NestJS. We don't use presigned S3 URLs in the browser because of CORS issues (S3 is a different origin from CloudFront). The frontend fetches llms.txt content via this same-origin API endpoint.
- **Cache invalidation**: deploy workflow invalidates `/*` on CloudFront after SPA upload.

### Authentication

- **Three auth methods**: email+password, Google OAuth, GitHub OAuth.
- **JWT tokens** in httpOnly cookies: `access_token` (1h) + `refresh_token` (7d). `SameSite=None; Secure` in production (cross-origin between CloudFront and ALB).
- **OAuth flow**: `GET /api/auth/google` (or `/github`) → provider consent → callback → issues JWT cookies → redirects to `/dashboard`. Uses `findOrCreateOAuthUser()` — no auto-linking if email is taken by a password account.
- **Anonymous sessions**: `session_id` cookie tracked in `anon_sessions` table. Anon users get 1 free crawl job; signup required for more.
- **Required secrets**: `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GH_OAUTH_CLIENT_ID`, `GH_OAUTH_CLIENT_SECRET`.

### Database

- **RDS Postgres 16** in private subnet. Only ECS and Lambda security groups can reach it (port 5432).
- **`pages` and `discovered_urls` are cleaned up after job completion** — the Generator Lambda deletes them. Only the `jobs` table persists (with `s3_key` pointing to the result).
- **`pages_found` column on `jobs`** — stores final count before pages are deleted. The API returns this for completed jobs instead of counting from the (empty) pages table.
- **Progress tracking columns**: `pages_at_last_invocation` and `no_progress_strikes` on `jobs` — used by the monitor to detect permanently broken jobs.

### Redis

- **ElastiCache Redis** in private subnet. Used only for Pub/Sub (no persistence).
- **`REDIS_URL` env var** needed by consumer, generator, and NestJS (ECS).
- **Fire-and-forget** — if nobody is subscribed to `job:{id}`, messages are discarded. The frontend uses polling as a fallback if SSE doesn't connect.

### Email (SES)

- **Domain `llmtxtgenerator.online`** verified in SES with DKIM (Route 53 records managed by Terraform).
- **Completion emails** sent by the generator Lambda for logged-in users. HTML + plain-text, links to the job results page.
- **Currently in SES sandbox** — only verified recipient emails receive mail. Production access request pending. The email helper gracefully catches sandbox rejections (logs a warning, doesn't fail the job).
- **From address**: `noreply@llmtxtgenerator.online`.

### ECS / Docker

- **Dockerfile at `packages/api/Dockerfile`** — multi-stage build. Production image is `node:20-slim` (Prisma v7 uses WASM, no OpenSSL needed).
- **Startup command**: `prisma migrate deploy && node packages/api/dist/main.js` — applies pending migrations then starts NestJS.
- **Health checks**: `GET /api/health` (liveness, shallow — used by ALB) and `GET /api/health/ready` (readiness — pings DB + Redis, checks `jobs` table exists). ALB only uses the shallow one.
- **`force-new-deployment`** — the deploy workflow pushes to ECR with `:latest` tag and forces ECS redeployment.

### CI/CD

- **GitHub Actions**: `ci.yml` (PR: lint, format:check, test, schema-drift-check, terraform validate) and `deploy.yml` (push to main: test → selective deploy based on changed paths → smoke test).
- **Selective deploys**: `changes` job diffs `HEAD~1` to detect which packages changed. Only deploys affected components (SPA, API, crawler, lambdas, terraform).
- **Smoke tests**: post-deploy job hits `/api/health`, `/api/health/ready`, SPA shell, then runs end-to-end crawls for both cheerio (configcat.com) and playwright (blut.studio) paths.
- **Pre-push hook**: `npx prisma generate && npm run build && npm run test` via husky.
- **Required secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `JWT_SECRET`, `DB_PASSWORD`, `PROJECT`, `ENVIRONMENT`, `ECR_REPOSITORY_URL`, `ECS_CLUSTER`, `ECS_SERVICE`, `SPA_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GH_OAUTH_CLIENT_ID`, `GH_OAUTH_CLIENT_SECRET`.
- **Terraform state**: S3 bucket `llm-crawler-terraform-state` + DynamoDB table `llm-crawler-terraform-locks` for locking.

### Monitoring

- **4 CloudWatch dashboards**: `llm-crawler-dev-operations` (overview), `llm-crawler-dev-pipeline` (queue depths, Lambda durations), `llm-crawler-dev-database` (RDS + Redis), `llm-crawler-dev-cost` (daily invocations, memory usage).
- **Alarms** (SNS email): DLQ not-empty (×3), Lambda errors >5/10min (×4), ECS no running tasks.
- **SNS topic**: `llm-crawler-dev-alerts`.

### Testing

- **194 tests across 7 packages** using Vitest.
- Mocking pattern: `vi.mock('@llm-crawler/shared', ...)` to mock Prisma, Redis, etc. Use dynamic `await import(...)` after mocks for proper hoisting.
- Crawler tests mock `fetcher.ts` to return controlled HTML.
- Web tests use `happy-dom` + `@testing-library/react` (not jsdom — `ERR_REQUIRE_ESM` on Node 20).
- No integration tests — all tests are unit tests with mocked dependencies.

## Other files

- `benchmark/benchmark.ts` — Cheerio vs Playwright comparison script (not part of any package)
- `docs/benchmark_cheerio_vs_playwright.md` — benchmark results
- Design spec: `docs/superpowers/specs/2026-04-10-llms-txt-generator-design.md`
- Phase plans: `docs/superpowers/plans/`

Note: the spec reflects the original design. The code has diverged in some areas. The code is the source of truth.
