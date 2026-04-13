import type { Browser, Page } from 'playwright-core';
import type { PageCrawledEvent } from '@llm-crawler/shared';
import { normalizeUrl, createLogger } from '@llm-crawler/shared';
import { extractPageData, extractLinks } from './parser.js';

const log = createLogger('spa-crawler');

export interface SpaCrawlConfig {
  browser: Browser;
  rootUrl: string;
  maxDepth: number;
  maxPages: number;
  visited?: string[];
  onPageCrawled: (event: PageCrawledEvent) => Promise<void>;
  onCompleted: () => Promise<void>;
}

/**
 * Crawls a SPA by navigating client-side via history.pushState.
 * Uses a single browser page — navigates from root via the SPA router
 * instead of direct page.goto() which would hit 404s on SPA sub-routes.
 */
export async function crawlSpa(config: SpaCrawlConfig): Promise<void> {
  const { browser, rootUrl, maxDepth, maxPages, visited: initialVisited = [], onPageCrawled, onCompleted } = config;
  const origin = new URL(rootUrl).origin;
  const visited = new Set<string>(initialVisited.map(normalizeUrl));
  let pageCount = 0;

  const page = await browser.newPage();

  try {
    // Load the root page via normal navigation
    log.info('Loading root', { rootUrl });
    await page.goto(rootUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Crawl root
    const rootHtml = await page.content();
    const rootData = extractPageData(rootHtml, rootUrl, 0);
    const rootLinks = extractLinks(rootHtml, rootUrl);
    const rootNormalized = normalizeUrl(rootUrl);
    visited.add(rootNormalized);
    pageCount++;

    const rootNewUrls = rootLinks.filter((l) => !visited.has(l));
    for (const u of rootNewUrls) visited.add(u);
    await onPageCrawled({ jobId: '', ...rootData, newUrls: rootNewUrls });
    log.info('Root crawled', { newUrlCount: rootNewUrls.length });

    // BFS through sub-pages using client-side navigation
    let currentLevel = rootNewUrls.filter((u) => new URL(u).origin === origin);

    for (let depth = 1; depth <= maxDepth && currentLevel.length > 0 && pageCount < maxPages; depth++) {
      const nextLevel: string[] = [];

      for (const url of currentLevel) {
        if (pageCount >= maxPages) break;

        try {
          const pathname = new URL(url).pathname;
          log.info('Navigating client-side', { pathname });

          // Navigate via history API (client-side, no server roundtrip)
          await page.evaluate((path) => {
            window.history.pushState({}, '', path);
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
          }, pathname);

          // Wait for the SPA to re-render
          await page.waitForTimeout(1500);
          // Also wait for any network requests to settle
          await page.waitForLoadState('networkidle').catch(() => {});

          const html = await page.content();
          const pageData = extractPageData(html, url, depth);
          const links = extractLinks(html, url);
          const newUrls = links.filter((l) => !visited.has(l));
          for (const u of newUrls) visited.add(u);

          if (depth < maxDepth) {
            nextLevel.push(...newUrls.filter((u) => new URL(u).origin === origin));
          }

          pageCount++;
          await onPageCrawled({ jobId: '', ...pageData, newUrls });
          log.info('Page crawled', { page: pageCount, url, depth, newUrlCount: newUrls.length });
        } catch (err) {
          log.warn('Failed to navigate', { url, error: err instanceof Error ? err.message : String(err) });
        }
      }

      currentLevel = nextLevel;
    }
  } finally {
    await page.close();
  }

  await onCompleted();
}
