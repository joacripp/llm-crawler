import type { PageCrawledEvent } from '@llm-crawler/shared';
import type { Browser } from 'playwright';
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
export declare function crawl(config: CrawlConfig): Promise<void>;
//# sourceMappingURL=crawl.d.ts.map