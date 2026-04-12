import type { SQSEvent } from 'aws-lambda';
import type { JobCompletedEvent, PageData } from '@llm-crawler/shared';
import { getPrisma, generateLlmsTxt, publishJobUpdate, disconnectPrisma, disconnectRedis } from '@llm-crawler/shared';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function handler(event: SQSEvent): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET env var is required');
  const prisma = getPrisma();
  const s3 = new S3Client();
  try {
    for (const record of event.Records) {
      const envelope = JSON.parse(record.body);
      const detail: JobCompletedEvent = envelope.detail;
      const { jobId } = detail;
      console.log(`[generator] Starting job=${jobId}`);

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      const rootUrl = job.rootUrl;
      console.log(`[generator] job=${jobId} rootUrl=${rootUrl}`);

      const pages = await prisma.page.findMany({ where: { jobId } });
      console.log(`[generator] job=${jobId} found ${pages.length} pages`);
      const pageData: PageData[] = pages.map((p: any) => ({
        url: p.url, title: p.title ?? p.url, description: p.description ?? '', depth: p.depth ?? 0,
      }));

      const llmsTxt = generateLlmsTxt(pageData, rootUrl);
      const s3Key = `results/${jobId}/llms.txt`;
      console.log(`[generator] job=${jobId} llms.txt generated (${llmsTxt.length} chars)`);

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: llmsTxt, ContentType: 'text/plain' }));
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `results/${jobId}/pages.json`, Body: JSON.stringify(pageData, null, 2), ContentType: 'application/json' }));
      console.log(`[generator] job=${jobId} uploaded to S3: ${s3Key}`);

      await prisma.job.update({ where: { id: jobId }, data: { status: 'completed', s3Key, pagesFound: pages.length } });
      await prisma.page.deleteMany({ where: { jobId } });
      await prisma.discoveredUrl.deleteMany({ where: { jobId } });
      console.log(`[generator] job=${jobId} completed — DB cleaned up`);

      const downloadUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;
      await publishJobUpdate(jobId, { type: 'completed', downloadUrl });
      console.log(`[generator] job=${jobId} Redis notified`);
    }
  } finally { await disconnectPrisma(); await disconnectRedis(); }
}
