import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPages = [
  { url: 'https://example.com/', title: 'Home', description: 'Homepage', depth: 0 },
  { url: 'https://example.com/docs/intro', title: 'Intro', description: 'Getting started', depth: 1 },
];
const mockJob = { id: 'job-1', rootUrl: 'https://example.com', userId: null };
const mockFindMany = vi.fn().mockResolvedValue(mockPages);
const mockFindUnique = vi.fn().mockResolvedValue(mockJob);
const mockFindUserByPk = vi.fn();
const mockDeleteManyPages = vi.fn().mockResolvedValue({ count: 2 });
const mockDeleteManyDiscovered = vi.fn().mockResolvedValue({ count: 5 });
const mockUpdateJob = vi.fn().mockResolvedValue({});

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      page: { findMany: mockFindMany, deleteMany: mockDeleteManyPages },
      discoveredUrl: { deleteMany: mockDeleteManyDiscovered },
      job: { update: mockUpdateJob, findUniqueOrThrow: mockFindUnique },
      user: { findUnique: mockFindUserByPk },
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
    sendJobCompletionEmail: vi.fn().mockResolvedValue(undefined),
  };
});

const mockPutObject = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockPutObject })),
  PutObjectCommand: vi.fn().mockImplementation((input) => input),
}));

const { handler } = await import('../src/handler.js');
const { publishJobUpdate, sendJobCompletionEmail } = await import('@llm-crawler/shared');

function makeSQSEvent(detail: object) {
  return {
    Records: [{ body: JSON.stringify({ source: 'llm-crawler', 'detail-type': 'job.completed', detail }) }],
  } as any;
}

describe('generator handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.S3_BUCKET = 'test-bucket';
    // Default: anonymous job (no userId)
    mockFindUnique.mockResolvedValue(mockJob);
  });

  it('reads rootUrl from job record', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'job-1' } });
  });

  it('reads pages from Postgres', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
    expect(mockFindMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
  });

  it('uploads llms.txt and pages.json to S3', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
    expect(mockPutObject).toHaveBeenCalledTimes(2);
    const firstCall = mockPutObject.mock.calls[0][0];
    expect(firstCall.Key).toBe('results/job-1/llms.txt');
    expect(firstCall.Bucket).toBe('test-bucket');
  });

  it('cleans up pages and discovered_urls', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
    expect(mockDeleteManyPages).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(mockDeleteManyDiscovered).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
  });

  it('updates job status to completed with s3_key', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'completed', s3Key: 'results/job-1/llms.txt', pagesFound: 2 },
    });
  });

  it('publishes completion to Redis', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ type: 'completed' }));
  });

  describe('email notifications', () => {
    it('sends email to logged-in user on job completion', async () => {
      mockFindUnique.mockResolvedValue({ ...mockJob, userId: 'user-1' });
      mockFindUserByPk.mockResolvedValue({ email: 'user@example.com' });

      await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));

      expect(mockFindUserByPk).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { email: true } });
      expect(sendJobCompletionEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        jobId: 'job-1',
        rootUrl: 'https://example.com',
        pagesFound: 2,
      });
    });

    it('skips email for anonymous jobs (no userId)', async () => {
      await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));

      expect(mockFindUserByPk).not.toHaveBeenCalled();
      expect(sendJobCompletionEmail).not.toHaveBeenCalled();
    });

    it('skips email when user has no email address', async () => {
      mockFindUnique.mockResolvedValue({ ...mockJob, userId: 'user-1' });
      mockFindUserByPk.mockResolvedValue({ email: null });

      await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));

      expect(mockFindUserByPk).toHaveBeenCalled();
      expect(sendJobCompletionEmail).not.toHaveBeenCalled();
    });
  });

  describe('race guard: consumer has not caught up', () => {
    it('throws when zero pages persisted (pagesEmitted provided)', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      await expect(handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 3 }))).rejects.toThrow(/0\/3 pages persisted/);
    });

    it('throws when partial pages persisted (not all events consumed yet)', async () => {
      mockFindMany.mockResolvedValueOnce([mockPages[0]]); // 1 of 5
      await expect(handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 5 }))).rejects.toThrow(/1\/5 pages persisted/);
    });

    it('proceeds when all expected pages are persisted', async () => {
      await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 2 }));
      expect(mockPutObject).toHaveBeenCalledTimes(2);
    });

    it('proceeds when more pages than expected (extra from prior invocations)', async () => {
      await handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 1 }));
      expect(mockPutObject).toHaveBeenCalledTimes(2);
    });

    it('falls back to requiring >= 1 page when pagesEmitted is absent (legacy/monitor events)', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      await expect(handler(makeSQSEvent({ jobId: 'job-1' }))).rejects.toThrow(/0\/1 pages persisted/);
    });

    it('does not delete pages or mark completed when racing consumer', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      await expect(handler(makeSQSEvent({ jobId: 'job-1', pagesEmitted: 3 }))).rejects.toThrow();
      expect(mockDeleteManyPages).not.toHaveBeenCalled();
      expect(mockDeleteManyDiscovered).not.toHaveBeenCalled();
      expect(mockUpdateJob).not.toHaveBeenCalled();
      expect(mockPutObject).not.toHaveBeenCalled();
    });
  });
});
