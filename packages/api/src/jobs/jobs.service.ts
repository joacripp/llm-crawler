import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getPrisma } from '@llm-crawler/shared';
import type { JobMessage } from '@llm-crawler/shared';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { verifyUrlDns } from './url-safety.js';

interface CreateJobOptions {
  rootUrl: string;
  maxDepth?: number;
  maxPages?: number;
  userId?: string;
  anonSessionId?: string;
}

@Injectable()
export class JobsService {
  private sqs = new SQSClient();

  async createJob(options: CreateJobOptions) {
    const prisma = getPrisma();
    const { rootUrl, maxDepth = 10, maxPages = 1000, userId, anonSessionId } = options;

    // DNS resolution check — catches DNS rebinding (evil.com → 169.254.169.254)
    // and unreachable domains. Returns a user-friendly error message.
    const dnsCheck = await verifyUrlDns(rootUrl);
    if (!dnsCheck.ok) {
      throw new BadRequestException(dnsCheck.reason);
    }

    if (!userId && anonSessionId) {
      const existingCount = await prisma.job.count({ where: { anonSessionId } });
      if (existingCount >= 1)
        throw new ForbiddenException({ reason: 'signup_required', message: 'Sign up to create more jobs' });
    }
    const job = await prisma.job.create({ data: { rootUrl, maxDepth, maxPages, userId, anonSessionId } });
    const message: JobMessage = { jobId: job.id, urls: [rootUrl], maxDepth, maxPages };
    const queueUrl = process.env.JOBS_QUEUE_URL;
    if (queueUrl) {
      await this.sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }));
    }
    return job;
  }

  async getJob(jobId: string) {
    const prisma = getPrisma();
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    // For completed jobs, use the stored count (pages are deleted after completion)
    // For in-progress jobs, count from the pages table
    const pagesFound = job.status === 'completed' ? job.pagesFound : await prisma.page.count({ where: { jobId } });

    return { ...job, pagesFound };
  }

  async listJobs(userId: string, anonSessionId?: string) {
    const prisma = getPrisma();
    const where = anonSessionId ? { OR: [{ userId }, { anonSessionId }] } : { userId };
    return prisma.job.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getPresignedUrl(jobId: string): Promise<string | null> {
    const prisma = getPrisma();
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job?.s3Key) return null;
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client();
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: job.s3Key }), {
      expiresIn: 86400,
    });
  }

  async getContent(jobId: string): Promise<string | null> {
    const prisma = getPrisma();
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job?.s3Key) return null;
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client();
    const response = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: job.s3Key }));
    return response.Body?.transformToString() ?? null;
  }
}
