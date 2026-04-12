import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsertPage = vi.fn().mockResolvedValue({ id: 1 });
const mockUpsertDiscoveredUrl = vi.fn().mockResolvedValue({ id: 1 });
const mockUpdateJob = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockCountPages = vi.fn().mockResolvedValue(42);

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      page: { upsert: mockUpsertPage, count: mockCountPages },
      discoveredUrl: { upsert: mockUpsertDiscoveredUrl },
      job: { update: mockUpdateJob },
      $transaction: vi.fn(async (fn) => fn({
        page: { upsert: mockUpsertPage, count: mockCountPages },
        discoveredUrl: { upsert: mockUpsertDiscoveredUrl },
        job: { update: mockUpdateJob },
      })),
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

const { handler } = await import('../src/handler.js');
const { publishJobUpdate } = await import('@llm-crawler/shared');

function makeSQSEvent(detail: object) {
  return { Records: [{ body: JSON.stringify({ source: 'llm-crawler', 'detail-type': 'page.crawled', detail }) }] } as any;
}

describe('consumer handler', () => {
  beforeEach(() => { vi.clearAllMocks(); mockCountPages.mockResolvedValue(42); });

  it('upserts page data into Postgres', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', url: 'https://example.com/about', title: 'About', description: 'About page', depth: 1, newUrls: [] }));
    expect(mockUpsertPage).toHaveBeenCalled();
  });

  it('upserts discovered URLs', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', url: 'https://example.com/', title: 'Home', description: '', depth: 0, newUrls: ['https://example.com/about', 'https://example.com/docs'] }));
    expect(mockUpsertDiscoveredUrl).toHaveBeenCalledTimes(2);
  });

  it('updates job.updated_at', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', url: 'https://example.com/', title: 'Home', description: '', depth: 0, newUrls: [] }));
    expect(mockUpdateJob).toHaveBeenCalled();
  });

  it('publishes progress to Redis', async () => {
    await handler(makeSQSEvent({ jobId: 'job-1', url: 'https://example.com/', title: 'Home', description: '', depth: 0, newUrls: [] }));
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', { type: 'progress', pagesFound: 42 });
  });
});
