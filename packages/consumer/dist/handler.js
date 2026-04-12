import { getPrisma, publishJobUpdate, disconnectPrisma, disconnectRedis } from '@llm-crawler/shared';
export async function handler(event) {
    const prisma = getPrisma();
    try {
        for (const record of event.Records) {
            const envelope = JSON.parse(record.body);
            const detail = envelope.detail;
            const { jobId, url, title, description, depth, newUrls } = detail;
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
                await tx.job.update({
                    where: { id: jobId },
                    data: { updatedAt: new Date(), status: 'running' },
                });
            });
            const pagesFound = await prisma.page.count({ where: { jobId } });
            await publishJobUpdate(jobId, { type: 'progress', pagesFound });
        }
    }
    finally {
        await disconnectPrisma();
        await disconnectRedis();
    }
}
//# sourceMappingURL=handler.js.map