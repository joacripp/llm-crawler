import type { SQSEvent } from 'aws-lambda';
import type { JobMessage } from '@llm-crawler/shared';
import { crawl } from './crawl.js';
import { crawlSpa } from './spa-crawler.js';
import { EventEmitter } from './event-emitter.js';
import { isSpa } from './spa-detector.js';
import { fetchWithAxios } from './fetcher.js';

export async function handler(event: SQSEvent): Promise<void> {
  const busName = process.env.EVENT_BUS_NAME;
  if (!busName) throw new Error('EVENT_BUS_NAME env var is required');

  const record = event.Records[0];
  const message: JobMessage = JSON.parse(record.body);
  const { jobId, urls, visited, maxDepth = 3, maxPages = 200 } = message;

  console.log(`[crawler] Starting job=${jobId} urls=${urls.length} visited=${visited?.length ?? 0} maxDepth=${maxDepth} maxPages=${maxPages}`);
  console.log(`[crawler] Root URLs: ${urls.slice(0, 5).join(', ')}${urls.length > 5 ? '...' : ''}`);

  const emitter = new EventEmitter(busName);

  // SPA detection: probe root with Cheerio, fall back to Playwright if SPA detected
  let useBrowser = false;
  if (!visited && urls.length === 1) {
    console.log(`[crawler] Probing ${urls[0]} for SPA detection...`);
    const probeHtml = await fetchWithAxios(urls[0]);
    if (probeHtml && isSpa(probeHtml)) {
      useBrowser = true;
      console.log(`[crawler] SPA detected — using Playwright`);
    } else {
      console.log(`[crawler] Server-rendered — using Cheerio`);
    }
  }

  let browser;
  if (useBrowser) {
    const { chromium } = await import('playwright-core');
    const sparticuzChromium = await import('@sparticuz/chromium');
    const execPath = await sparticuzChromium.default.executablePath();
    console.log(`[crawler] Launching Chromium from ${execPath}`);
    // Remove --single-process from sparticuz args — it crashes on second browser.newPage()
    const args = sparticuzChromium.default.args.filter((a: string) => a !== '--single-process');
    browser = await chromium.launch({
      headless: true,
      executablePath: execPath,
      args,
    });
    console.log(`[crawler] Playwright browser launched`);
  }

  let pageCount = 0;
  let eventCount = 0;

  const onPageCrawled = async (pageEvent: any) => {
    pageCount++;
    eventCount++;
    console.log(`[crawler] Page ${pageCount}: ${pageEvent.url} (depth=${pageEvent.depth}, newUrls=${pageEvent.newUrls.length})`);
    await emitter.emitPageCrawled({ ...pageEvent, jobId });
    console.log(`[crawler] Event emitted: page.crawled #${eventCount}`);
  };

  const onCompleted = async () => {
    console.log(`[crawler] Crawl complete — ${pageCount} pages crawled, ${eventCount} events emitted`);
    await emitter.emitJobCompleted({ jobId });
    console.log(`[crawler] Event emitted: job.completed`);
  };

  try {
    if (useBrowser && browser) {
      // SPA: single-page client-side navigation
      await crawlSpa({
        browser, rootUrl: urls[0], maxDepth, maxPages, visited,
        onPageCrawled, onCompleted,
      });
    } else {
      // Server-rendered: standard BFS with Cheerio
      await crawl({
        urls, visited, maxDepth, maxPages,
        concurrency: 5, useBrowser: false,
        onPageCrawled, onCompleted,
      });
    }
  } catch (err) {
    console.error(`[crawler] Error in job=${jobId}:`, err);
    throw err;
  } finally {
    await browser?.close();
    console.log(`[crawler] Job ${jobId} finished. Pages: ${pageCount}, Events: ${eventCount}`);
  }
}
