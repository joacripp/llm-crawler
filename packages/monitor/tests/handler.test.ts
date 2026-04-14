import { describe, it, expect, vi, beforeEach } from 'vitest';

const staleJob = { id: 'stale-1', rootUrl: 'https://example.com', invocations: 2, maxDepth: 3, maxPages: 200 };
const mockFindManyJobs = vi.fn().mockResolvedValue([staleJob]);
const mockFindManyPages = vi
  .fn()
  .mockResolvedValue([{ url: 'https://example.com/' }, { url: 'https://example.com/about' }]);
const mockFindManyDiscovered = vi
  .fn()
  .mockResolvedValue([
    { url: 'https://example.com/' },
    { url: 'https://example.com/about' },
    { url: 'https://example.com/docs' },
    { url: 'https://example.com/blog' },
  ]);
const mockUpdateJob = vi.fn().mockResolvedValue({});

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      job: { findMany: mockFindManyJobs, update: mockUpdateJob },
      page: { findMany: mockFindManyPages },
      discoveredUrl: { findMany: mockFindManyDiscovered },
    })),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
  };
});

const mockSendMessage = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({ send: mockSendMessage })),
  SendMessageCommand: vi.fn().mockImplementation((input) => input),
}));

const { handler } = await import('../src/handler.js');

describe('monitor handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOBS_QUEUE_URL = 'https://sqs.example.com/crawl-jobs';
    process.env.COMPLETED_QUEUE_URL = 'https://sqs.example.com/crawl-completed';
    process.env.MAX_INVOCATIONS = '10';
    process.env.STALE_THRESHOLD_MINUTES = '3';
  });

  it('finds stale jobs', async () => {
    await handler();
    expect(mockFindManyJobs).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'running' }) }),
    );
  });

  it('computes pending URLs (discovered minus visited)', async () => {
    await handler();
    const call = mockSendMessage.mock.calls[0][0];
    const body = JSON.parse(call.MessageBody);
    expect(body.urls).toContain('https://example.com/docs');
    expect(body.urls).toContain('https://example.com/blog');
    expect(body.urls).not.toContain('https://example.com/');
    expect(body.urls).not.toContain('https://example.com/about');
  });

  it('includes visited URLs in message', async () => {
    await handler();
    const call = mockSendMessage.mock.calls[0][0];
    const body = JSON.parse(call.MessageBody);
    expect(body.visited).toContain('https://example.com/');
    expect(body.visited).toContain('https://example.com/about');
  });

  it('increments job invocations', async () => {
    await handler();
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'stale-1' },
      data: { invocations: 3, status: 'pending' },
    });
  });

  it('marks job as failed when max invocations exceeded', async () => {
    mockFindManyJobs.mockResolvedValueOnce([{ ...staleJob, invocations: 10 }]);
    await handler();
    expect(mockUpdateJob).toHaveBeenCalledWith({ where: { id: 'stale-1' }, data: { status: 'failed' } });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('triggers generator with pagesEmitted when no pending URLs remain', async () => {
    mockFindManyDiscovered.mockResolvedValueOnce([
      { url: 'https://example.com/' },
      { url: 'https://example.com/about' },
    ]);
    await handler();
    expect(mockSendMessage).toHaveBeenCalledOnce();
    const body = JSON.parse(mockSendMessage.mock.calls[0][0].MessageBody);
    expect(body['detail-type']).toBe('job.completed');
    expect(body.detail.pagesEmitted).toBe(2);
  });
});
