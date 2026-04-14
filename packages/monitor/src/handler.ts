import { getPrisma, disconnectPrisma, createLogger } from '@llm-crawler/shared';
import type { JobMessage } from '@llm-crawler/shared';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const log = createLogger('monitor');

const MAX_NO_PROGRESS_STRIKES = 2;

export async function handler(): Promise<void> {
  const queueUrl = process.env.JOBS_QUEUE_URL;
  if (!queueUrl) throw new Error('JOBS_QUEUE_URL env var is required');
  const completedQueueUrl = process.env.COMPLETED_QUEUE_URL;
  if (!completedQueueUrl) throw new Error('COMPLETED_QUEUE_URL env var is required');
  const maxInvocations = parseInt(process.env.MAX_INVOCATIONS ?? '10', 10);
  const staleMinutes = parseInt(process.env.STALE_THRESHOLD_MINUTES ?? '3', 10);
  const prisma = getPrisma();
  const sqs = new SQSClient();
  try {
    const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);
    const staleJobs = await prisma.job.findMany({ where: { status: 'running', updatedAt: { lt: threshold } } });
    log.info('Checking stale jobs', { staleCount: staleJobs.length, thresholdMinutes: staleMinutes });

    for (const job of staleJobs) {
      // Hard cap: too many invocations regardless of progress
      if (job.invocations >= maxInvocations) {
        log.warn('Job exceeded max invocations, marking failed', { jobId: job.id, invocations: job.invocations });
        await prisma.job.update({ where: { id: job.id }, data: { status: 'failed' } });
        continue;
      }

      const currentPageCount = await prisma.page.count({ where: { jobId: job.id } });

      // Progress check: if the last retry produced zero new pages, increment
      // the no-progress strike counter. Two consecutive strikes → give up.
      // This catches permanently broken jobs (e.g. SPA false-positive causing
      // Playwright crash on every attempt) much faster than the invocations
      // hard cap (~6 min vs ~30 min).
      let strikes = job.noProgressStrikes;
      if (job.invocations > 0 && currentPageCount <= job.pagesAtLastInvocation) {
        strikes++;
        log.warn('No progress since last invocation', {
          jobId: job.id,
          strikes,
          maxStrikes: MAX_NO_PROGRESS_STRIKES,
          currentPages: currentPageCount,
          previousPages: job.pagesAtLastInvocation,
        });
        if (strikes >= MAX_NO_PROGRESS_STRIKES) {
          log.warn('Job failed: no progress after repeated retries', { jobId: job.id, strikes });
          await prisma.job.update({ where: { id: job.id }, data: { status: 'failed' } });
          continue;
        }
      } else {
        strikes = 0;
      }

      const visitedRows = await prisma.page.findMany({ where: { jobId: job.id }, select: { url: true } });
      const visited = visitedRows.map((r) => r.url);
      const visitedSet = new Set(visited);
      const discoveredRows = await prisma.discoveredUrl.findMany({ where: { jobId: job.id }, select: { url: true } });
      const pending = discoveredRows.map((r) => r.url).filter((url) => !visitedSet.has(url));

      if (pending.length === 0) {
        log.info('No pending URLs, triggering generator', { jobId: job.id, visitedCount: visited.length });
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: completedQueueUrl,
            MessageBody: JSON.stringify({
              source: 'llm-crawler',
              'detail-type': 'job.completed',
              detail: { jobId: job.id },
            }),
          }),
        );
        continue;
      }

      log.info('Re-enqueueing stale job', {
        jobId: job.id,
        pendingCount: pending.length,
        visitedCount: visited.length,
        invocation: job.invocations + 1,
        strikes,
      });
      const message: JobMessage = {
        jobId: job.id,
        urls: pending,
        visited,
        maxDepth: job.maxDepth,
        maxPages: job.maxPages,
      };
      await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }));
      await prisma.job.update({
        where: { id: job.id },
        data: {
          invocations: job.invocations + 1,
          status: 'pending',
          pagesAtLastInvocation: currentPageCount,
          noProgressStrikes: strikes,
        },
      });
    }
  } finally {
    await disconnectPrisma();
  }
}
