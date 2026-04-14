import { describe, it, expect, vi, beforeEach } from 'vitest';

const staleJob = {
  id: 'stale-1',
  rootUrl: 'https://example.com',
  invocations: 2,
  maxDepth: 10,
  maxPages: 1000,
  pagesAtLastInvocation: 0,
  noProgressStrikes: 0,
};
const mockFindManyJobs = vi.fn().mockResolvedValue([staleJob]);
const mockFindManyPages = vi
  .fn()
  .mockResolvedValue([{ url: 'https://example.com/' }, { url: 'https://example.com/about' }]);
const mockCountPages = vi.fn().mockResolvedValue(2);
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
      page: { findMany: mockFindManyPages, count: mockCountPages },
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

  it('increments job invocations and stores pagesAtLastInvocation', async () => {
    await handler();
    expect(mockUpdateJob).toHaveBeenCalledWith({
      where: { id: 'stale-1' },
      data: {
        invocations: 3,
        status: 'pending',
        pagesAtLastInvocation: 2,
        noProgressStrikes: 0,
      },
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

  describe('progress-based failure detection', () => {
    it('increments no-progress strikes when page count has not increased', async () => {
      // Job had 2 pages at last invocation, still has 2 → no progress
      mockFindManyJobs.mockResolvedValueOnce([{ ...staleJob, invocations: 3, pagesAtLastInvocation: 2 }]);
      mockCountPages.mockResolvedValueOnce(2);
      await handler();
      const updateData = mockUpdateJob.mock.calls[0][0].data;
      expect(updateData.noProgressStrikes).toBe(1);
    });

    it('resets strikes when progress is detected', async () => {
      mockFindManyJobs.mockResolvedValueOnce([
        { ...staleJob, invocations: 3, pagesAtLastInvocation: 2, noProgressStrikes: 1 },
      ]);
      // Now has 5 pages → progress
      mockCountPages.mockResolvedValueOnce(5);
      await handler();
      const updateData = mockUpdateJob.mock.calls[0][0].data;
      expect(updateData.noProgressStrikes).toBe(0);
      expect(updateData.pagesAtLastInvocation).toBe(5);
    });

    it('marks job as failed after 2 consecutive no-progress strikes', async () => {
      mockFindManyJobs.mockResolvedValueOnce([
        { ...staleJob, invocations: 3, pagesAtLastInvocation: 2, noProgressStrikes: 1 },
      ]);
      // Still 2 → second strike → fail
      mockCountPages.mockResolvedValueOnce(2);
      await handler();
      expect(mockUpdateJob).toHaveBeenCalledWith({ where: { id: 'stale-1' }, data: { status: 'failed' } });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('does not check progress on first invocation (invocations === 0)', async () => {
      mockFindManyJobs.mockResolvedValueOnce([{ ...staleJob, invocations: 0, pagesAtLastInvocation: 0 }]);
      mockCountPages.mockResolvedValueOnce(0);
      await handler();
      // Should re-enqueue, not fail (first attempt hasn't happened yet)
      const updateData = mockUpdateJob.mock.calls[0][0].data;
      expect(updateData.status).toBe('pending');
      expect(updateData.noProgressStrikes).toBe(0);
    });
  });
});
