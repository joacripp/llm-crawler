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
}

export interface RedisProgressMessage {
  type: 'progress';
  pagesFound: number;
}

export interface RedisCompletedMessage {
  type: 'completed';
  downloadUrl: string;
}

export type RedisJobMessage = RedisProgressMessage | RedisCompletedMessage;
