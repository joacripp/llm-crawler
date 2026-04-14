// packages/shared/src/types.ts
export interface PageData {
  url: string;
  title: string;
  description: string;
  depth: number;
}

export interface JobMessage {
  jobId: string;
  urls: string[];
  visited?: string[];
  stateS3Key?: string;
  maxDepth?: number;
  maxPages?: number;
  /** When true, skip SPA detection and go straight to Playwright.
   *  Set by the monitor when a Cheerio crawl produces zero pages. */
  forceBrowser?: boolean;
}

export interface PageCrawledEvent {
  jobId: string;
  url: string;
  title: string;
  description: string;
  depth: number;
  newUrls: string[];
}

export interface JobCompletedEvent {
  jobId: string;
  /** Number of page.crawled events the crawler emitted. The generator
   *  waits until this many pages are persisted before building llms.txt. */
  pagesEmitted: number;
}

export interface RedisProgressMessage {
  type: 'progress';
  pagesFound: number;
  url?: string;
}

export interface RedisCompletedMessage {
  type: 'completed';
  downloadUrl: string;
}

export type RedisJobMessage = RedisProgressMessage | RedisCompletedMessage;
