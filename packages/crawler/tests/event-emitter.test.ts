// packages/crawler/tests/event-emitter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../src/event-emitter.js';
import type { PageCrawledEvent } from '@llm-crawler/shared';

const mockSend = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
vi.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutEventsCommand: vi.fn().mockImplementation((input) => input),
}));

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    mockSend.mockClear();
    emitter = new EventEmitter('test-bus');
  });

  it('emits page.crawled event', async () => {
    const event: PageCrawledEvent = {
      jobId: 'abc',
      url: 'https://example.com/about',
      title: 'About',
      description: 'About page',
      depth: 1,
      newUrls: ['https://example.com/team'],
    };
    await emitter.emitPageCrawled(event);
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.Entries[0].DetailType).toBe('page.crawled');
    expect(call.Entries[0].EventBusName).toBe('test-bus');
    expect(call.Entries[0].Source).toBe('llm-crawler');
  });

  it('splits events when newUrls exceeds 200', async () => {
    const bigUrls = Array.from({ length: 350 }, (_, i) => `https://example.com/page-${i}`);
    const event: PageCrawledEvent = {
      jobId: 'abc',
      url: 'https://example.com',
      title: 'Home',
      description: '',
      depth: 0,
      newUrls: bigUrls,
    };
    await emitter.emitPageCrawled(event);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('emits job.completed event with pagesEmitted', async () => {
    await emitter.emitJobCompleted({ jobId: 'abc', pagesEmitted: 7 });
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.Entries[0].DetailType).toBe('job.completed');
    const detail = JSON.parse(call.Entries[0].Detail);
    expect(detail.pagesEmitted).toBe(7);
  });
});
