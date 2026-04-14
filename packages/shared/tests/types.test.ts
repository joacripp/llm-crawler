// packages/shared/tests/types.test.ts
import { describe, it, expect } from 'vitest';
import type { PageData, JobMessage, PageCrawledEvent, JobCompletedEvent } from '../src/types.js';

describe('types', () => {
  it('PageData has required fields', () => {
    const page: PageData = { url: 'https://example.com', title: 'Example', description: 'A test page', depth: 0 };
    expect(page.url).toBe('https://example.com');
    expect(page.depth).toBe(0);
  });

  it('JobMessage supports first run (urls only)', () => {
    const msg: JobMessage = { jobId: 'abc-123', urls: ['https://example.com'] };
    expect(msg.visited).toBeUndefined();
    expect(msg.stateS3Key).toBeUndefined();
  });

  it('JobMessage supports resume with visited', () => {
    const msg: JobMessage = { jobId: 'abc-123', urls: ['https://example.com/docs'], visited: ['https://example.com'] };
    expect(msg.visited).toHaveLength(1);
  });

  it('JobMessage supports resume with S3 key for large state', () => {
    const msg: JobMessage = { jobId: 'abc-123', urls: [], stateS3Key: 'state/abc-123/resume.json' };
    expect(msg.stateS3Key).toBeDefined();
  });

  it('PageCrawledEvent has required fields', () => {
    const event: PageCrawledEvent = {
      jobId: 'abc-123',
      url: 'https://example.com/about',
      title: 'About',
      description: 'About page',
      depth: 1,
      newUrls: ['https://example.com/team'],
    };
    expect(event.newUrls).toHaveLength(1);
  });

  it('JobCompletedEvent has jobId and pagesEmitted', () => {
    const event: JobCompletedEvent = { jobId: 'abc-123', pagesEmitted: 42 };
    expect(event.jobId).toBe('abc-123');
    expect(event.pagesEmitted).toBe(42);
  });
});
