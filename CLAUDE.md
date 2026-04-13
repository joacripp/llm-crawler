# llms.txt Generator

Automated tool that crawls websites and generates [llms.txt](https://llmstxt.org/) files.

## Architecture

Monorepo (Turborepo + npm workspaces) with 7 packages deployed on AWS.

### Packages

| Package              | Runtime       | Purpose                                                        |
| -------------------- | ------------- | -------------------------------------------------------------- |
| `packages/shared`    | Library       | Types, Prisma client, Redis pub, URL utils, llms.txt generator |
| `packages/crawler`   | Lambda        | BFS crawler (Cheerio). Emits events to EventBridge             |
| `packages/consumer`  | Lambda        | Persists pages to Postgres, publishes progress to Redis        |
| `packages/generator` | Lambda        | Builds llms.txt from pages, uploads to S3, cleans up Postgres  |
| `packages/monitor`   | Lambda        | Cron: detects stale jobs, re-enqueues for resurrection         |
| `packages/api`       | ECS Fargate   | NestJS: auth, job CRUD, SSE progress, content proxy            |
| `packages/web`       | CloudFront/S3 | React SPA: Vite + Tailwind                                     |

### Event flow

```
User → CloudFront → NestJS API → SQS (jobs) → Crawler Lambda
                                                    ↓
                                              EventBridge
                                              ↓           ↓
                                    SQS (pages)    SQS (completed)
                                         ↓              ↓
                                  Consumer Lambda   Generator Lambda
                                    ↓       ↓           ↓       ↓
                                 Postgres  Redis       S3     Redis
                                              ↓                 ↓
                                         NestJS SSE → Frontend
```

### Infrastructure (`infra/`)

Terraform modules: networking, database (RDS Postgres 16), redis (ElastiCache), storage (S3), queues (SQS + DLQs), events (EventBridge), lambdas, api (ECS + ALB), cdn (CloudFront).

CloudFront routes `/api/*` to the ALB (NestJS), everything else to S3 (React SPA).

## Development

### Prerequisites

- Node.js >= 20.19 (required by Prisma)
- AWS CLI configured
- Terraform (for infra changes)

### Setup

```bash
npm install
npx prisma generate    # REQUIRED before build — generates Prisma client
npm run build
npm run test           # 91 tests across 7 packages
```

### Running locally

```bash
# API (needs DATABASE_URL, REDIS_URL, JOBS_QUEUE_URL, S3_BUCKET, JWT_SECRET env vars)
cd packages/api && npm run start:dev

# Frontend (proxies /api to localhost:3000)
cd packages/web && npm run dev
```

## Gotchas & Operational Knowledge

### Prisma

- **Always run `npx prisma generate` after `npm install`** — the Prisma client is generated code, not committed. Build will fail with `Module '"@prisma/client"' has no exported member 'PrismaClient'` if you skip this.
- **Schema at `prisma/schema.prisma`** — shared by all packages.
- **No binary targets needed** — v7 uses WASM engine, not native binaries. No OpenSSL dependency.
- **Prisma v7** — uses WASM engine (no native binary, no OpenSSL needed). `@prisma/adapter-pg` for Postgres. Schema has no `url` in datasource — connection URL passed via adapter in code and `--url` flag for CLI. Config in `prisma/prisma.config.ts`.
- **ECS Dockerfile runs `prisma db push` on startup** — this syncs the schema to RDS. Schema changes are applied automatically on next deploy. No separate migration step needed for dev.

### Lambda Bundling

- **esbuild bundles each Lambda into a single CJS file** — see `.github/workflows/deploy.yml`.
- **All Lambdas use the same esbuild command** — everything bundled inline. Only `@aws-sdk/*` (provided by Lambda runtime) and `playwright` are externalized.
- **CJS format, not ESM** — ioredis uses `require("events")` which breaks in ESM bundles. All Lambdas use `--format=cjs`.
- **Prisma v7 WASM engine bundles cleanly** — no native binaries, no special handling needed.

### Playwright / SPA Support

- **Playwright is disabled in Lambda** — the Chromium binary is ~200MB, exceeding Lambda zip limits (50MB) and Layer limits (250MB).
- The SPA detection code (`spa-detector.ts`, `fetcher.ts`) still exists in the codebase but is not called from the Lambda handler.
- To enable SPA support: switch the crawler Lambda to a **container image Lambda** (up to 10GB) with Chromium installed. The code is ready, just the packaging needs to change.
- The SPA heuristic has false positives — sites with `<script type="module">` get flagged even if server-rendered. May need tuning.

### CloudFront / Frontend

- **CloudFront has two origins**: S3 (default, serves React SPA) and ALB (`/api/*` path pattern, forwards to NestJS).
- **SPA routing**: CloudFront returns `index.html` for 403/404 errors so React Router works.
- **Content proxy**: `/api/jobs/:id/content` streams S3 content through NestJS. We don't use presigned S3 URLs in the browser because of CORS issues (S3 is a different origin from CloudFront). The frontend fetches llms.txt content via this same-origin API endpoint.
- **Cache invalidation**: deploy workflow invalidates `/*` on CloudFront after SPA upload.

### Database

- **RDS Postgres 16** in private subnet. Only ECS and Lambda security groups can reach it (port 5432).
- **Managed password was replaced with explicit password** — stored in GitHub secret `DB_PASSWORD` and Terraform variable `db_password`. The original `manage_master_user_password` caused issues because Terraform couldn't include the password in `DATABASE_URL`.
- **`pages` and `discovered_urls` are cleaned up after job completion** — the Generator Lambda deletes them. Only the `jobs` table persists (with `s3_key` pointing to the result).
- **`pages_found` column on `jobs`** — stores final count before pages are deleted. The API returns this for completed jobs instead of counting from the (empty) pages table.

### Redis

- **ElastiCache Redis** in private subnet. Used only for Pub/Sub (no persistence).
- **`REDIS_URL` env var** needed by consumer, generator, and NestJS (ECS).
- **Fire-and-forget** — if nobody is subscribed to `job:{id}`, messages are discarded. The frontend uses polling as a fallback if SSE doesn't connect.

### ECS / Docker

- **Dockerfile at `packages/api/Dockerfile`** — multi-stage build. Production image is `node:20-slim` + OpenSSL (needed for Prisma CLI `db push`).
- **Startup command**: `prisma db push --accept-data-loss --skip-generate && node packages/api/dist/main.js` — syncs schema then starts NestJS.
- **Health check**: `GET /api/health` returns `{"status":"ok"}`. Excluded from session middleware (no DB call).
- **`force-new-deployment`** — the deploy workflow pushes to ECR with `:latest` tag and forces ECS redeployment. If you push a new image manually, run `aws ecs update-service --cluster llm-crawler-dev --service llm-crawler-dev-api --force-new-deployment`.

### CI/CD

- **GitHub Actions**: `ci.yml` (PR: lint, test, terraform validate) and `deploy.yml` (push to main: test → parallel deploy).
- **Deploy order**: test passes → SPA, API, Lambdas, and Terraform all deploy in parallel.
- **Required secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `JWT_SECRET`, `DB_PASSWORD`, `PROJECT`, `ENVIRONMENT`, `ECR_REPOSITORY_URL`, `ECS_CLUSTER`, `ECS_SERVICE`, `SPA_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.
- **Terraform state**: S3 bucket `llm-crawler-terraform-state` + DynamoDB table `llm-crawler-terraform-locks` for locking.

### Testing

- **91 tests across 7 packages** using Vitest.
- Mocking pattern: `vi.mock('@llm-crawler/shared', ...)` to mock Prisma, Redis, etc. Use dynamic `await import(...)` after mocks for proper hoisting.
- Crawler tests mock `fetcher.ts` to return controlled HTML.
- No integration tests — all tests are unit tests with mocked dependencies.

## Specs & Plans

- Design spec: `docs/superpowers/specs/2026-04-10-llms-txt-generator-design.md`
- Phase plans: `docs/superpowers/plans/`
- Benchmark data: `docs/benchmark_cheerio_vs_playwright.md`

Note: the spec reflects the original design. The code has diverged in some areas (no Playwright in Lambda, content proxy). The code is the source of truth.
