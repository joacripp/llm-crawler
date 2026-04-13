import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockPageCount = vi.fn().mockResolvedValue(42);

vi.mock('@llm-crawler/shared', () => ({
  getPrisma: vi.fn(() => ({
    job: { create: mockCreate, findUnique: mockFindUnique, findMany: mockFindMany, count: mockCount },
    page: { count: mockPageCount },
  })),
}));

const mockSendMessage = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({ send: mockSendMessage })),
  SendMessageCommand: vi.fn().mockImplementation((input) => input),
}));

const { JobsService } = await import('../src/jobs/jobs.service.js');

describe('JobsService', () => {
  let service: InstanceType<typeof JobsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOBS_QUEUE_URL = 'https://sqs.example.com/crawl-jobs';
    service = new JobsService();
  });

  it('creates a job and enqueues to SQS', async () => {
    mockCreate.mockResolvedValue({ id: 'job-1', rootUrl: 'https://example.com', status: 'pending' });
    const job = await service.createJob({
      rootUrl: 'https://example.com',
      maxDepth: 3,
      maxPages: 200,
      anonSessionId: 'sess-1',
    });
    expect(mockCreate).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalled();
    expect(job.id).toBe('job-1');
  });

  it('gets job by id with page count', async () => {
    mockFindUnique.mockResolvedValue({ id: 'job-1', status: 'running', s3Key: null });
    const result = await service.getJob('job-1');
    expect(result.id).toBe('job-1');
    expect(result.pagesFound).toBe(42);
  });

  it('enforces signup gate on second anonymous job', async () => {
    mockCount.mockResolvedValue(1);
    await expect(service.createJob({ rootUrl: 'https://example.com', anonSessionId: 'sess-1' })).rejects.toThrow();
  });

  it('allows authenticated users to create multiple jobs', async () => {
    mockCount.mockResolvedValue(5);
    mockCreate.mockResolvedValue({ id: 'job-6', rootUrl: 'https://example.com', status: 'pending' });
    const job = await service.createJob({ rootUrl: 'https://example.com', userId: 'user-1' });
    expect(job.id).toBe('job-6');
  });

  it('lists jobs for a user', async () => {
    mockFindMany.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]);
    const jobs = await service.listJobs('user-1');
    expect(jobs).toHaveLength(2);
  });
});
