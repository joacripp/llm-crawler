var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getPrisma } from '@llm-crawler/shared';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
let JobsService = class JobsService {
    sqs = new SQSClient();
    async createJob(options) {
        const prisma = getPrisma();
        const { rootUrl, maxDepth = 3, maxPages = 200, userId, anonSessionId } = options;
        if (!userId && anonSessionId) {
            const existingCount = await prisma.job.count({ where: { anonSessionId } });
            if (existingCount >= 1)
                throw new ForbiddenException({ reason: 'signup_required', message: 'Sign up to create more jobs' });
        }
        const job = await prisma.job.create({ data: { rootUrl, maxDepth, maxPages, userId, anonSessionId } });
        const message = { jobId: job.id, urls: [rootUrl], maxDepth, maxPages };
        const queueUrl = process.env.JOBS_QUEUE_URL;
        if (queueUrl) {
            await this.sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }));
        }
        return job;
    }
    async getJob(jobId) {
        const prisma = getPrisma();
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job)
            throw new NotFoundException('Job not found');
        const pagesFound = await prisma.page.count({ where: { jobId } });
        return { ...job, pagesFound };
    }
    async listJobs(userId) {
        const prisma = getPrisma();
        return prisma.job.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }
    async getPresignedUrl(jobId) {
        const prisma = getPrisma();
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job?.s3Key)
            return null;
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client();
        return getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: job.s3Key }), { expiresIn: 86400 });
    }
};
JobsService = __decorate([
    Injectable()
], JobsService);
export { JobsService };
//# sourceMappingURL=jobs.service.js.map