import type { SQSEvent } from 'aws-lambda';
import type { JobMessage, PageCrawledEvent } from '@llm-crawler/shared';
import { createLogger } from '@llm-crawler/shared';
import { crawl } from './crawl.js';
import { crawlSpa } from './spa-crawler.js';
import { EventEmitter } from './event-emitter.js';
import { isSpa } from './spa-detector.js';
import { fetchWithAxios } from './fetcher.js';

const log = createLogger('crawler');

export async function handler(event: SQSEvent): Promise<void> {
  const busName = process.env.EVENT_BUS_NAME;
  if (!busName) throw new Error('EVENT_BUS_NAME env var is required');

  const record = event.Records[0];
  const message: JobMessage = JSON.parse(record.body);
  const { jobId, urls, visited, maxDepth = 3, maxPages = 200 } = message;

  log.info('Starting job', { jobId, urlCount: urls.length, visitedCount: visited?.length ?? 0, maxDepth, maxPages });
  log.info('Root URLs', { jobId, urls: urls.slice(0, 5) });

  const emitter = new EventEmitter(busName);

  let useBrowser = false;
  if (!visited && urls.length === 1) {
    log.info('Probing for SPA detection', { jobId, url: urls[0] });
    const probeHtml = await fetchWithAxios(urls[0]);
    if (probeHtml && isSpa(probeHtml)) {
      useBrowser = true;
      log.info('SPA detected — using Playwright', { jobId });
    } else {
      log.info('Server-rendered — using Cheerio', { jobId });
    }
  }

  let browser;
  if (useBrowser) {
    const { chromium } = await import('playwright-core');
    const sparticuzChromium = await import('@sparticuz/chromium');
    const execPath = await sparticuzChromium.default.executablePath();
    log.info('Launching Chromium', { jobId, execPath });
    const args = sparticuzChromium.default.args.filter((a: string) => a !== '--single-process');
    browser = await chromium.launch({ headless: true, executablePath: execPath, args });
    log.info('Playwright browser launched', { jobId });
  }

  let pageCount = 0;
  let eventCount = 0;

  const onPageCrawled = async (pageEvent: PageCrawledEvent) => {
    pageCount++;
    eventCount++;
    log.info('Page crawled', {
      jobId,
      page: pageCount,
      url: pageEvent.url,
      depth: pageEvent.depth,
      newUrls: pageEvent.newUrls.length,
    });
    await emitter.emitPageCrawled({ ...pageEvent, jobId });
  };

  const onCompleted = async () => {
    log.info('Crawl complete', { jobId, pageCount, eventCount });
    await emitter.emitJobCompleted({ jobId, pagesEmitted: pageCount });
  };

  try {
    if (useBrowser && browser) {
      await crawlSpa({ browser, rootUrl: urls[0], maxDepth, maxPages, visited, onPageCrawled, onCompleted });
    } else {
      await crawl({ urls, visited, maxDepth, maxPages, concurrency: 5, useBrowser: false, onPageCrawled, onCompleted });
    }
  } catch (err) {
    log.error('Crawl failed', { jobId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    await browser?.close();
    log.info('Job finished', { jobId, pageCount, eventCount });
  }
}
