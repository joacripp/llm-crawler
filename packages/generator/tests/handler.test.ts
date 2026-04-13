import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPages = [
  { url: 'https://example.com/', title: 'Home', description: 'Homepage', depth: 0 },
  { url: 'https://example.com/docs/intro', title: 'Intro', description: 'Getting started', depth: 1 },
];
const mockJob = { id: 'job-1', rootUrl: 'https://example.com' };
const mockFindMany = vi.fn().mockResolvedValue(mockPages);
const mockFindUnique = vi.fn().mockResolvedValue(mockJob);
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
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

const mockPutObject = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockPutObject })),
  PutObjectCommand: vi.fn().mockImplementation((input) => input),
}));

const { handler } = await import('../src/handler.js');
const { publishJobUpdate } = await import('@llm-crawler/shared');

function makeSQSEvent(detail: object) {
  return {
    Records: [{ body: JSON.stringify({ source: 'llm-crawler', 'detail-type': 'job.completed', detail }) }],
  } as any;
}

describe('generator handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.S3_BUCKET = 'test-bucket';
  });

  it('reads rootUrl from job record', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'job-1' } });
  });

  it('reads pages from Postgres', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockFindMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
  });

  it('uploads llms.txt and pages.json to S3', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockPutObject).toHaveBeenCalledTimes(2);
    const firstCall = mockPutObject.mock.calls[0][0];
    expect(firstCall.Key).toBe('results/job-1/llms.txt');
    expect(firstCall.Bucket).toBe('test-bucket');
  });

  it('cleans up pages and discovered_urls', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockDeleteManyPages).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(mockDeleteManyDiscovered).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
  });

  it('updates job status to completed with s3_key', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'completed', s3Key: 'results/job-1/llms.txt', pagesFound: 2 },
    });
  });

  it('publishes completion to Redis', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1' }));
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ type: 'completed' }));
  });

  describe('race guard: no pages persisted yet', () => {
    it('throws (so SQS retries) instead of marking the job complete with empty data', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      await expect(handler(makeSQSEvent({ jobId: 'job-1' }))).rejects.toThrow(/likely raced consumer/);
    });

    it('does not delete pages or mark completed when racing consumer', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      await expect(handler(makeSQSEvent({ jobId: 'job-1' }))).rejects.toThrow();
      expect(mockDeleteManyPages).not.toHaveBeenCalled();
      expect(mockDeleteManyDiscovered).not.toHaveBeenCalled();
      expect(mockUpdateJob).not.toHaveBeenCalled();
      expect(mockPutObject).not.toHaveBeenCalled();
    });
  });
});
