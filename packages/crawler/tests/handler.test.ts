// packages/crawler/tests/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCrawl = vi.fn().mockImplementation(async (config) => {
  await config.onPageCrawled({
    jobId: '',
    url: 'https://example.com/',
    title: 'Home',
    description: '',
    depth: 0,
    newUrls: [],
  });
  await config.onCompleted();
});
vi.mock('../src/crawl.js', () => ({ crawl: mockCrawl }));

const mockEmitPageCrawled = vi.fn().mockResolvedValue(undefined);
const mockEmitJobCompleted = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/event-emitter.js', () => ({
  EventEmitter: vi.fn().mockImplementation(() => ({
    emitPageCrawled: mockEmitPageCrawled,
    emitJobCompleted: mockEmitJobCompleted,
  })),
}));

vi.mock('../src/spa-detector.js', () => ({
  isSpa: vi.fn().mockReturnValue(false),
}));

// Must import AFTER mocks are set up
const { handler } = await import('../src/handler.js');

function makeSQSEvent(body: object) {
  return { Records: [{ body: JSON.stringify(body) }] } as any;
}

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVENT_BUS_NAME = 'test-bus';
  });

  it('parses SQS message and starts crawl', async () => {
    await handler(makeSQSEvent({ jobId: 'abc-123', urls: ['https://example.com/'] }));
    expect(mockCrawl).toHaveBeenCalledOnce();
    const config = mockCrawl.mock.calls[0][0];
    expect(config.urls).toEqual(['https://example.com/']);
    expect(config.useBrowser).toBe(false);
  });

  it('emits events for each crawled page', async () => {
    await handler(makeSQSEvent({ jobId: 'abc-123', urls: ['https://example.com/'] }));
    expect(mockEmitPageCrawled).toHaveBeenCalledOnce();
    expect(mockEmitPageCrawled.mock.calls[0][0].jobId).toBe('abc-123');
  });

  it('emits job.completed with pagesEmitted count', async () => {
    await handler(makeSQSEvent({ jobId: 'abc-123', urls: ['https://example.com/'] }));
    expect(mockEmitJobCompleted).toHaveBeenCalledWith({ jobId: 'abc-123', pagesEmitted: 1 });
  });

  it('passes visited URLs on resume', async () => {
    await handler(
      makeSQSEvent({ jobId: 'abc-123', urls: ['https://example.com/docs'], visited: ['https://example.com/'] }),
    );
    const config = mockCrawl.mock.calls[0][0];
    expect(config.visited).toEqual(['https://example.com/']);
  });

  it('skips SPA detection and attempts browser path when forceBrowser is set', async () => {
    const { isSpa } = await import('../src/spa-detector.js');
    // forceBrowser=true triggers Playwright import which isn't available in test env.
    // The handler will throw — that's expected. The key assertion is SPA detection was skipped.
    await expect(
      handler(makeSQSEvent({ jobId: 'abc-123', urls: ['https://example.com/'], forceBrowser: true })),
    ).rejects.toThrow();
    expect(isSpa).not.toHaveBeenCalled();
    // crawl() should NOT have been called (browser path, not cheerio path)
    expect(mockCrawl).not.toHaveBeenCalled();
  });
});
