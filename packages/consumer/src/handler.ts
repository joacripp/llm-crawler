import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { getPrisma, publishJobUpdate, disconnectPrisma, disconnectRedis, createLogger } from '@llm-crawler/shared';

const log = createLogger('consumer');

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  log.info('Processing records', { count: event.Records.length });
  const prisma = getPrisma();
  const failures: SQSBatchResponse['batchItemFailures'] = [];
  try {
    for (const record of event.Records) {
      try {
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

          // Batch insert discovered URLs instead of looping upserts.
          // Pages with 200+ outbound links caused sequential upserts to
          // exceed Prisma's default 5s transaction timeout.
          // createMany + skipDuplicates is one round trip regardless of count.
          if (newUrls.length > 0) {
            await tx.discoveredUrl.createMany({
              data: newUrls.map((discoveredUrl) => ({ jobId, url: discoveredUrl })),
              skipDuplicates: true,
            });
          }

          // Only transition pending → running. Never clobber completed/failed.
          await tx.job.updateMany({
            where: { id: jobId, status: 'pending' },
            data: { updatedAt: new Date(), status: 'running' },
          });
          // Bump updatedAt on running jobs for the resurrection monitor.
          await tx.job.updateMany({
            where: { id: jobId, status: 'running' },
            data: { updatedAt: new Date() },
          });
        });

        const pagesFound = await prisma.page.count({ where: { jobId } });
        log.info('Page persisted', { jobId, pagesFound });
        await publishJobUpdate(jobId, { type: 'progress', pagesFound, url });
      } catch (err) {
        log.error('Failed to process record', {
          messageId: record.messageId,
          error: err instanceof Error ? err.message : String(err),
        });
        failures.push({ itemIdentifier: record.messageId });
      }
    }
  } finally {
    await disconnectPrisma();
    await disconnectRedis();
  }
  if (failures.length > 0) {
    log.warn('Batch partially failed', {
      total: event.Records.length,
      failed: failures.length,
      failedIds: failures.map((f) => f.itemIdentifier),
    });
  }
  return { batchItemFailures: failures };
}
