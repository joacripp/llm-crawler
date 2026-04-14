-- Update default values for crawl depth and pages.
ALTER TABLE "jobs" ALTER COLUMN "max_depth" SET DEFAULT 10;
ALTER TABLE "jobs" ALTER COLUMN "max_pages" SET DEFAULT 1000;
