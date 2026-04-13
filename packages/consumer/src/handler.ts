import type { SQSEvent } from 'aws-lambda';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { getPrisma, publishJobUpdate, disconnectPrisma, disconnectRedis, createLogger } from '@llm-crawler/shared';

const log = createLogger('consumer');

export async function handler(event: SQSEvent): Promise<void> {
  log.info('Processing records', { count: event.Records.length });
  const prisma = getPrisma();
  try {
    for (const record of event.Records) {
      const envelope = JSON.parse(record.body);
      const detail: PageCrawledEvent = envelope.detail;
      const { jobId, url, title, description, depth, newUrls } = detail;

      log.info('Persisting page', { jobId, url, depth, newUrlCount: newUrls.length });

      await prisma.$transaction(async (tx) => {
        await tx.page.upsert({
          where: { jobId_url: { jobId, url } },
          create: { jobId, url, title, description, depth },
          update: { title, description, depth },
        });
        for (const discoveredUrl of newUrls) {
          await tx.discoveredUrl.upsert({
            where: { jobId_url: { jobId, url: discoveredUrl } },
            create: { jobId, url: discoveredUrl },
            update: {},
          });
        }
        // Only transition pending → running. Never clobber completed/failed:
        // page.crawled events can arrive after the generator has already marked
        // the job completed (different SQS queues, no ordering), and resetting
        // to 'running' would cause the resurrection monitor to re-enqueue.
        await tx.job.updateMany({
          where: { id: jobId, status: 'pending' },
          data: { updatedAt: new Date(), status: 'running' },
        });
        // Always bump updatedAt on running jobs so the resurrection monitor
        // sees fresh activity. Skipped for completed/failed jobs.
        await tx.job.updateMany({
          where: { id: jobId, status: 'running' },
          data: { updatedAt: new Date() },
        });
      });

      const pagesFound = await prisma.page.count({ where: { jobId } });
      log.info('Page persisted', { jobId, pagesFound });
      await publishJobUpdate(jobId, { type: 'progress', pagesFound, url });
    }
  } finally {
    await disconnectPrisma();
    await disconnectRedis();
  }
}
