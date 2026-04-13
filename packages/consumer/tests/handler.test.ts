import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsertPage = vi.fn().mockResolvedValue({ id: 1 });
const mockUpsertDiscoveredUrl = vi.fn().mockResolvedValue({ id: 1 });
const mockUpdateManyJob = vi.fn().mockResolvedValue({ count: 1 });
const mockCountPages = vi.fn().mockResolvedValue(42);

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      page: { upsert: mockUpsertPage, count: mockCountPages },
      discoveredUrl: { upsert: mockUpsertDiscoveredUrl },
      job: { updateMany: mockUpdateManyJob },
      $transaction: vi.fn(async (fn) =>
        fn({
          page: { upsert: mockUpsertPage, count: mockCountPages },
          discoveredUrl: { upsert: mockUpsertDiscoveredUrl },
          job: { updateMany: mockUpdateManyJob },
        }),
      ),
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

const { handler } = await import('../src/handler.js');
const { publishJobUpdate } = await import('@llm-crawler/shared');

function makeSQSEvent(detail: object) {
  return {
    Records: [{ body: JSON.stringify({ source: 'llm-crawler', 'detail-type': 'page.crawled', detail }) }],
  } as any;
}

describe('consumer handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountPages.mockResolvedValue(42);
  });

  it('upserts page data into Postgres', async () => {
    await handler(
      makeSQSEvent({
        jobId: 'job-1',
        url: 'https://example.com/about',
        title: 'About',
        description: 'About page',
        depth: 1,
        newUrls: [],
      }),
    );
    expect(mockUpsertPage).toHaveBeenCalled();
  });

  it('upserts discovered URLs', async () => {
    await handler(
      makeSQSEvent({
        jobId: 'job-1',
        url: 'https://example.com/',
        title: 'Home',
        description: '',
        depth: 0,
        newUrls: ['https://example.com/about', 'https://example.com/docs'],
      }),
    );
    expect(mockUpsertDiscoveredUrl).toHaveBeenCalledTimes(2);
  });

  it('publishes progress to Redis', async () => {
    await handler(
      makeSQSEvent({
        jobId: 'job-1',
        url: 'https://example.com/',
        title: 'Home',
        description: '',
        depth: 0,
        newUrls: [],
      }),
    );
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', {
      type: 'progress',
      pagesFound: 42,
      url: 'https://example.com/',
    });
  });

  describe('job status updates', () => {
    it('transitions pending → running with fresh updatedAt', async () => {
      await handler(
        makeSQSEvent({
          jobId: 'job-1',
          url: 'https://example.com/',
          title: 'Home',
          description: '',
          depth: 0,
          newUrls: [],
        }),
      );

      // Two updateMany calls: one to flip pending→running, one to bump updatedAt on running.
      expect(mockUpdateManyJob).toHaveBeenCalledTimes(2);

      const flipCall = mockUpdateManyJob.mock.calls[0][0];
      expect(flipCall.where).toEqual({ id: 'job-1', status: 'pending' });
      expect(flipCall.data.status).toBe('running');
      expect(flipCall.data.updatedAt).toBeInstanceOf(Date);
    });

    it('bumps updatedAt only when status is running (not completed/failed)', async () => {
      await handler(
        makeSQSEvent({
          jobId: 'job-1',
          url: 'https://example.com/',
          title: 'Home',
          description: '',
          depth: 0,
          newUrls: [],
        }),
      );

      const bumpCall = mockUpdateManyJob.mock.calls[1][0];
      expect(bumpCall.where).toEqual({ id: 'job-1', status: 'running' });
      // Crucially, no `status` field in `data` — we don't clobber completed/failed.
      expect(bumpCall.data).not.toHaveProperty('status');
      expect(bumpCall.data.updatedAt).toBeInstanceOf(Date);
    });

    it('does not write status field on the heartbeat update (preserves completed/failed)', async () => {
      // Regression test for the race where consumer arrived after generator
      // marked the job 'completed' and clobbered the status back to 'running',
      // causing the resurrection monitor to re-enqueue forever.
      await handler(
        makeSQSEvent({
          jobId: 'job-1',
          url: 'https://example.com/',
          title: 'Home',
          description: '',
          depth: 0,
          newUrls: [],
        }),
      );

      for (const call of mockUpdateManyJob.mock.calls) {
        const arg = call[0];
        // No call should ever match a 'completed' or 'failed' job in its where clause.
        expect(arg.where.status).not.toBe('completed');
        expect(arg.where.status).not.toBe('failed');
      }
    });
  });
});
