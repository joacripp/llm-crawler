// packages/crawler/tests/crawl.test.ts
import { describe, it, expect, vi } from 'vitest';
import { crawl } from '../src/crawl.js';
import type { PageCrawledEvent } from '@llm-crawler/shared';

vi.mock('../src/fetcher.js', () => ({
  fetchWithAxios: vi.fn().mockImplementation((url: string) => {
    const pages: Record<string, string> = {
      'https://example.com/': '<html><head><title>Home</title><meta name="description" content="Homepage"></head><body><a href="/about">About</a><a href="/docs">Docs</a></body></html>',
      'https://example.com/about': '<html><head><title>About</title></head><body><a href="/team">Team</a></body></html>',
      'https://example.com/docs': '<html><head><title>Docs</title></head><body><a href="/docs/intro">Intro</a></body></html>',
      'https://example.com/team': '<html><head><title>Team</title></head><body></body></html>',
      'https://example.com/docs/intro': '<html><head><title>Intro</title></head><body></body></html>',
    };
    return Promise.resolve(pages[url] ?? null);
  }),
  fetchWithBrowser: vi.fn(),
}));

describe('crawl', () => {
  it('crawls root and discovers child pages', async () => {
    const events: PageCrawledEvent[] = [];
    let completed = false;
    await crawl({
      urls: ['https://example.com/'],
      maxDepth: 1, maxPages: 10, concurrency: 2, useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => { completed = true; },
    });
    expect(events.length).toBe(3);
    expect(events[0].url).toBe('https://example.com/');
    expect(events[0].newUrls).toContain('https://example.com/about');
    expect(events[0].newUrls).toContain('https://example.com/docs');
    expect(completed).toBe(true);
  });

  it('respects maxDepth', async () => {
    const events: PageCrawledEvent[] = [];
    await crawl({
      urls: ['https://example.com/'],
      maxDepth: 0, maxPages: 10, concurrency: 2, useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => {},
    });
    expect(events.length).toBe(1);
  });

  it('respects maxPages', async () => {
    const events: PageCrawledEvent[] = [];
    await crawl({
      urls: ['https://example.com/'],
      maxDepth: 10, maxPages: 2, concurrency: 2, useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => {},
    });
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('seeds visited set to skip already-crawled URLs', async () => {
    const events: PageCrawledEvent[] = [];
    await crawl({
      urls: ['https://example.com/'],
      visited: ['https://example.com/about'],
      maxDepth: 1, maxPages: 10, concurrency: 2, useBrowser: false,
      onPageCrawled: async (event) => { events.push(event); },
      onCompleted: async () => {},
    });
    expect(events.find(e => e.url === 'https://example.com/about')).toBeUndefined();
    expect(events.find(e => e.url === 'https://example.com/docs')).toBeDefined();
  });
});
