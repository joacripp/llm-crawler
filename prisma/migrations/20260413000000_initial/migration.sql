-- Initial baseline migration. Generated to match prisma/schema.prisma.
-- Replaces the previous `prisma db push --accept-data-loss` flow.
--
-- Note: gen_random_uuid() is built-in on Postgres 13+, so no extension needed.

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "password_hash" TEXT,
    "oauth_provider" TEXT,
    "oauth_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anon_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anon_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "anon_session_id" UUID,
    "root_url" TEXT NOT NULL,
    "max_depth" INTEGER NOT NULL DEFAULT 3,
    "max_pages" INTEGER NOT NULL DEFAULT 200,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "s3_key" TEXT,
    "pages_found" INTEGER NOT NULL DEFAULT 0,
    "invocations" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" SERIAL NOT NULL,
    "job_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "depth" INTEGER,
    "crawled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_urls" (
    "id" SERIAL NOT NULL,
    "job_id" UUID NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "discovered_urls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_jobs_status" ON "jobs"("status", "updated_at");

-- CreateIndex
CREATE INDEX "idx_jobs_anon" ON "jobs"("anon_session_id");

-- CreateIndex
CREATE INDEX "idx_jobs_user" ON "jobs"("user_id");

-- CreateIndex
CREATE INDEX "idx_pages_job" ON "pages"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_job_id_url_key" ON "pages"("job_id", "url");

-- CreateIndex
CREATE INDEX "idx_discovered_job" ON "discovered_urls"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "discovered_urls_job_id_url_key" ON "discovered_urls"("job_id", "url");

-- AddForeignKey
ALTER TABLE "anon_sessions" ADD CONSTRAINT "anon_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_anon_session_id_fkey" FOREIGN KEY ("anon_session_id") REFERENCES "anon_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
