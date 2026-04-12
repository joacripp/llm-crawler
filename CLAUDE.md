# llms.txt Generator

Automated tool that crawls websites and generates [llms.txt](https://llmstxt.org/) files.

## Architecture

Monorepo (Turborepo + npm workspaces) with 7 packages deployed on AWS.

### Packages

| Package | Runtime | Purpose |
|---|---|---|
| `packages/shared` | Library | Types, Prisma client, Redis pub, URL utils, llms.txt generator |
| `packages/crawler` | Lambda | BFS crawler (Cheerio). Emits events to EventBridge |
| `packages/consumer` | Lambda | Persists pages to Postgres, publishes progress to Redis |
| `packages/generator` | Lambda | Builds llms.txt from pages, uploads to S3, cleans up Postgres |
| `packages/monitor` | Lambda | Cron: detects stale jobs, re-enqueues for resurrection |
| `packages/api` | ECS Fargate | NestJS: auth, job CRUD, SSE progress, content proxy |
| `packages/web` | CloudFront/S3 | React SPA: Vite + Tailwind |

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

Terraform modules: networking, database (RDS Postgres), redis (ElastiCache), storage (S3), queues (SQS + DLQs), events (EventBridge), lambdas, api (ECS + ALB), cdn (CloudFront).

## Development

```bash
npm install
npx prisma generate
npm run build
npm run test
```

### Running locally

```bash
# API
cd packages/api && npm run start:dev

# Frontend (proxies /api to localhost:3000)
cd packages/web && npm run dev
```

### Key decisions

- **Cheerio only in Lambda** — Playwright is too large (~200MB) for Lambda zip. SPA support requires container image Lambda (future).
- **Prisma v5** — v7's adapter pattern had issues with RDS. Native engine with `debian-openssl-3.0.x` + `rhel-openssl-3.0.x` binary targets.
- **esbuild for Lambda bundling** — Single CJS file per Lambda. Crawler bundles everything; consumer/generator/monitor externalize Prisma (included as node_modules in zip).
- **Content proxy** — `/api/jobs/:id/content` proxies S3 content through NestJS to avoid CORS issues with presigned URLs.
- **No pending_urls table** — Crawler is stateful in memory. Monitor reconstructs pending frontier from `discovered_urls - pages` on resurrection.
- **Redis Pub/Sub** — Fire-and-forget progress delivery. NestJS subscribes per active SSE connection only.

## CI/CD

GitHub Actions: `.github/workflows/ci.yml` (PR) and `deploy.yml` (merge to main).

Deploy pipeline: test → parallel deploy (SPA to S3, API to ECR/ECS, Lambdas via esbuild+zip, Terraform apply).

### Required GitHub Secrets

`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `JWT_SECRET`, `DB_PASSWORD`, `PROJECT`, `ENVIRONMENT`, `ECR_REPOSITORY_URL`, `ECS_CLUSTER`, `ECS_SERVICE`, `SPA_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`

## Specs & Plans

- Design spec: `docs/superpowers/specs/2026-04-10-llms-txt-generator-design.md`
- Phase plans: `docs/superpowers/plans/`
- Benchmark data: `docs/benchmark_cheerio_vs_playwright.md`
