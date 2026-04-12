import type { SQSEvent } from 'aws-lambda';
import type { JobMessage } from '@llm-crawler/shared';
import { crawl } from './crawl.js';
import { EventEmitter } from './event-emitter.js';

export async function handler(event: SQSEvent): Promise<void> {
  const busName = process.env.EVENT_BUS_NAME;
  if (!busName) throw new Error('EVENT_BUS_NAME env var is required');

  const record = event.Records[0];
  const message: JobMessage = JSON.parse(record.body);
  const { jobId, urls, visited, maxDepth = 3, maxPages = 200 } = message;

  console.log(`[crawler] Starting job=${jobId} urls=${urls.length} visited=${visited?.length ?? 0} maxDepth=${maxDepth} maxPages=${maxPages}`);
  console.log(`[crawler] Root URLs: ${urls.slice(0, 5).join(', ')}${urls.length > 5 ? '...' : ''}`);

  const emitter = new EventEmitter(busName);

  // SPA detection disabled in Lambda — Playwright is too large (~200MB).
  // All crawling uses Cheerio. SPA support is a future enhancement
  // (requires Lambda Layer or container image).
  const useBrowser = false;
  console.log(`[crawler] Using Cheerio (Lambda mode)`);

  let pageCount = 0;
  let eventCount = 0;

  try {
    await crawl({
      urls, visited, maxDepth, maxPages,
      concurrency: 5,
      useBrowser: false,
      onPageCrawled: async (pageEvent) => {
        pageCount++;
        eventCount++;
        console.log(`[crawler] Page ${pageCount}: ${pageEvent.url} (depth=${pageEvent.depth}, newUrls=${pageEvent.newUrls.length})`);
        await emitter.emitPageCrawled({ ...pageEvent, jobId });
        console.log(`[crawler] Event emitted: page.crawled #${eventCount}`);
      },
      onCompleted: async () => {
        console.log(`[crawler] Crawl complete — ${pageCount} pages crawled, ${eventCount} events emitted`);
        await emitter.emitJobCompleted({ jobId });
        console.log(`[crawler] Event emitted: job.completed`);
      },
    });
  } catch (err) {
    console.error(`[crawler] Error in job=${jobId}:`, err);
    throw err;
  } finally {
    console.log(`[crawler] Job ${jobId} finished. Pages: ${pageCount}, Events: ${eventCount}`);
  }
}
