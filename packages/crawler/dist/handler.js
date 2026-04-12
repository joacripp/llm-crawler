import { crawl } from './crawl.js';
import { EventEmitter } from './event-emitter.js';
import { isSpa } from './spa-detector.js';
import { fetchWithAxios } from './fetcher.js';
export async function handler(event) {
    const busName = process.env.EVENT_BUS_NAME;
    if (!busName)
        throw new Error('EVENT_BUS_NAME env var is required');
    const record = event.Records[0];
    const message = JSON.parse(record.body);
    const { jobId, urls, visited, maxDepth = 3, maxPages = 200 } = message;
    const emitter = new EventEmitter(busName);
    let useBrowser = false;
    if (!visited && urls.length === 1) {
        const probeHtml = await fetchWithAxios(urls[0]);
        if (probeHtml && isSpa(probeHtml)) {
            useBrowser = true;
        }
    }
    let browser;
    if (useBrowser) {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: true });
    }
    try {
        await crawl({
            urls, visited, maxDepth, maxPages,
            concurrency: useBrowser ? 3 : 5,
            useBrowser, browser,
            onPageCrawled: async (event) => { await emitter.emitPageCrawled({ ...event, jobId }); },
            onCompleted: async () => { await emitter.emitJobCompleted({ jobId }); },
        });
    }
    finally {
        await browser?.close();
    }
}
//# sourceMappingURL=handler.js.map