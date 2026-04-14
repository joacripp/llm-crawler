// packages/crawler/src/crawl.ts
import pLimit from 'p-limit';
import { normalizeUrl } from '@llm-crawler/shared';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { fetchWithAxios, fetchWithBrowser } from './fetcher.js';
import { extractPageData, extractLinks } from './parser.js';
import type { Browser } from 'playwright-core';

export interface CrawlConfig {
  urls: string[];
  visited?: string[];
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  useBrowser: boolean;
  browser?: Browser;
  onPageCrawled: (event: PageCrawledEvent) => Promise<void>;
  onCompleted: () => Promise<void>;
}

export async function crawl(config: CrawlConfig): Promise<void> {
  const {
    urls,
    visited: initialVisited = [],
    maxDepth,
    maxPages,
    concurrency,
    useBrowser,
    browser,
    onPageCrawled,
    onCompleted,
  } = config;
  const visited = new Set<string>(initialVisited.map(normalizeUrl));
  const limit = pLimit(concurrency);
  let pageCount = 0;

  let currentLevel = urls.map(normalizeUrl).filter((u) => !visited.has(u));
  for (const url of currentLevel) visited.add(url);

  for (let depth = 0; depth <= maxDepth && currentLevel.length > 0 && pageCount < maxPages; depth++) {
    const nextLevel: string[] = [];
    await Promise.all(
      currentLevel.map((url) =>
        limit(async () => {
          if (pageCount >= maxPages) return;
          const html = useBrowser && browser ? await fetchWithBrowser(browser, url) : await fetchWithAxios(url);
          if (!html) return;
          if (pageCount >= maxPages) return; // re-check after async fetch
          pageCount++;
          const pageData = extractPageData(html, url, depth);
          const links = extractLinks(html, url);
          const newUrls = links.filter((link) => !visited.has(link));
          for (const link of newUrls) {
            visited.add(link);
            if (depth < maxDepth) nextLevel.push(link);
          }
          const event: PageCrawledEvent = { jobId: '', ...pageData, newUrls };
          await onPageCrawled(event);
        }),
      ),
    );
    currentLevel = nextLevel;
  }
  await onCompleted();
}
