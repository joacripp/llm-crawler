import { describe, it, expect } from 'vitest';
import { generateLlmsTxt } from '../src/generator.js';
import type { PageData } from '../src/types.js';

describe('generateLlmsTxt', () => {
  it('generates header from root page', () => {
    const pages: PageData[] = [{ url: 'https://example.com/', title: 'Example Site', description: 'A great site', depth: 0 }];
    const result = generateLlmsTxt(pages, 'https://example.com');
    expect(result).toContain('# Example Site');
    expect(result).toContain('> A great site');
  });

  it('groups pages by first path segment', () => {
    const pages: PageData[] = [
      { url: 'https://example.com/', title: 'Home', description: 'Homepage', depth: 0 },
      { url: 'https://example.com/docs/intro', title: 'Intro', description: 'Getting started', depth: 1 },
      { url: 'https://example.com/docs/api', title: 'API', description: 'API reference', depth: 1 },
      { url: 'https://example.com/blog/post-1', title: 'Post 1', description: 'First post', depth: 1 },
    ];
    const result = generateLlmsTxt(pages, 'https://example.com');
    expect(result).toContain('## Docs');
    expect(result).toContain('## Blog');
    expect(result).toContain('- [Intro](https://example.com/docs/intro): Getting started');
  });

  it('prioritizes docs/api/blog sections', () => {
    const pages: PageData[] = [
      { url: 'https://example.com/', title: 'Home', description: '', depth: 0 },
      { url: 'https://example.com/zebra/page', title: 'Zebra', description: '', depth: 1 },
      { url: 'https://example.com/docs/page', title: 'Doc', description: '', depth: 1 },
      { url: 'https://example.com/blog/page', title: 'Blog', description: '', depth: 1 },
    ];
    const result = generateLlmsTxt(pages, 'https://example.com');
    const docsIdx = result.indexOf('## Docs');
    const blogIdx = result.indexOf('## Blog');
    const zebraIdx = result.indexOf('## Zebra');
    expect(docsIdx).toBeLessThan(blogIdx);
    expect(blogIdx).toBeLessThan(zebraIdx);
  });

  it('returns fallback for empty pages', () => {
    const result = generateLlmsTxt([], 'https://example.com');
    expect(result).toContain('No pages could be crawled');
  });

  it('extracts site title from separator patterns', () => {
    const pages: PageData[] = [{ url: 'https://example.com/', title: 'Home | My Brand', description: '', depth: 0 }];
    const result = generateLlmsTxt(pages, 'https://example.com');
    expect(result).toContain('# My Brand');
  });
});
