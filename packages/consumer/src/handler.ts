import type { SQSEvent } from 'aws-lambda';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { getPrisma, publishJobUpdate, disconnectPrisma, disconnectRedis } from '@llm-crawler/shared';

export async function handler(event: SQSEvent): Promise<void> {
  console.log(`[consumer] Processing ${event.Records.length} records`);
  const prisma = getPrisma();
  try {
    for (const record of event.Records) {
      const envelope = JSON.parse(record.body);
      const detail: PageCrawledEvent = envelope.detail;
      const { jobId, url, title, description, depth, newUrls } = detail;

      console.log(`[consumer] job=${jobId} url=${url} depth=${depth} newUrls=${newUrls.length}`);

      await prisma.$transaction(async (tx: any) => {
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
        await tx.job.update({
          where: { id: jobId },
          data: { updatedAt: new Date(), status: 'running' },
        });
      });

      const pagesFound = await prisma.page.count({ where: { jobId } });
      console.log(`[consumer] job=${jobId} persisted. Total pages: ${pagesFound}`);
      await publishJobUpdate(jobId, { type: 'progress', pagesFound, url });
    }
  } finally {
    await disconnectPrisma();
    await disconnectRedis();
  }
}
