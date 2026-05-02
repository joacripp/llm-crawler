# Restoring the Original Architecture

This document explains how to restore the full AWS infrastructure that was
removed for cost reasons. Current monthly cost: ~$0.90/mo. Restored cost: ~$90/mo.

## What was removed (and why)

| Resource                           | Monthly cost | Replacement                |
| ---------------------------------- | ------------ | -------------------------- |
| RDS PostgreSQL (db.t3.micro)       | ~$15         | Neon (serverless Postgres) |
| ElastiCache Redis (cache.t3.micro) | ~$12         | Upstash (serverless Redis) |
| NAT Gateway                        | ~$33         | N/A — no longer needed     |
| ECS Fargate (0.25 vCPU / 512 MB)   | ~$9          | Lambda container image     |
| ALB                                | ~$6          | API Gateway HTTP API       |
| CloudWatch Dashboards (×4)         | ~$12         | Removed                    |

**Neon and Upstash are permanent replacements** — the `database` and `redis`
Terraform modules have been deleted. `DATABASE_URL` and `REDIS_URL` are now
passed directly as Terraform variables.

## To restore ECS Fargate + ALB

1. In `infra/modules/networking/main.tf`, restore private subnets, NAT gateway,
   EIP, private route table + associations, lambda SG, db SG, redis SG.
   Use git history: `git log --oneline -- infra/modules/networking/main.tf`

2. In `infra/modules/networking/outputs.tf`, restore:
   - `private_subnet_ids`
   - `lambda_security_group_id`

3. In `infra/main.tf`:
   - Uncomment the `module "api"` block
   - Remove or comment out the `module "api_lambda"` block

4. In `.github/workflows/deploy.yml`, restore the original `deploy-api` job
   (docker build with `packages/api/Dockerfile` → `aws ecs update-service --force-new-deployment`).
   Also restore the "Wait for ECS to stabilize" step in the `smoke-test` job.

5. Run `terraform apply`.

## To restore CloudWatch Dashboards

The 4 dashboard resource blocks were deleted from
`infra/modules/monitoring/main.tf`. To restore:

1. Check git history: `git log --oneline -- infra/modules/monitoring/main.tf`
2. Cherry-pick or manually copy the four `resource "aws_cloudwatch_dashboard"` blocks back into the file.
3. Run `terraform apply`.

Cost: $3/dashboard × 4 = $12/mo.

## GitHub Actions secrets required

Ensure these secrets exist in the repository before deploying:

| Secret                       | Description                          |
| ---------------------------- | ------------------------------------ |
| `DATABASE_URL`               | Neon Postgres connection string      |
| `REDIS_URL`                  | Upstash Redis URL (rediss://...)     |
| `JWT_SECRET`                 | JWT signing secret                   |
| `GOOGLE_CLIENT_ID`           | Google OAuth client ID               |
| `GOOGLE_CLIENT_SECRET`       | Google OAuth client secret           |
| `GH_OAUTH_CLIENT_ID`         | GitHub OAuth client ID               |
| `GH_OAUTH_CLIENT_SECRET`     | GitHub OAuth client secret           |
| `AWS_ACCESS_KEY_ID`          | AWS credentials                      |
| `AWS_SECRET_ACCESS_KEY`      | AWS credentials                      |
| `ECR_REPOSITORY_URL`         | ECR URL for the API Lambda image     |
| `PROJECT`                    | Project name (llm-crawler)           |
| `ENVIRONMENT`                | Environment (dev)                    |
| `SPA_BUCKET`                 | S3 bucket name for the SPA           |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID           |
| `CRAWLER_ECR_URL`            | ECR URL for the crawler Lambda image |
