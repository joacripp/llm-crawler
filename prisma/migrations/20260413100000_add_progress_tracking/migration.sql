-- Add columns for progress-based stale-job detection.
-- The monitor uses these to distinguish "Lambda died mid-flight" (retryable)
-- from "this job will never make progress" (mark failed immediately).

ALTER TABLE "jobs" ADD COLUMN "pages_at_last_invocation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "jobs" ADD COLUMN "no_progress_strikes" INTEGER NOT NULL DEFAULT 0;
