// packages/shared/src/index.ts
export type {
  PageData,
  JobMessage,
  PageCrawledEvent,
  JobCompletedEvent,
  RedisProgressMessage,
  RedisCompletedMessage,
  RedisJobMessage,
} from './types.js';
export { normalizeUrl, isSkippableHref, isSkippableExtension, isSkippablePath } from './url-utils.js';
export { publishJobUpdate, disconnectRedis, pingRedis } from './redis.js';
export { getPrisma, disconnectPrisma, pingPrisma } from './prisma.js';
export { generateLlmsTxt } from './generator.js';
export { createLogger } from './logger.js';
export { sendJobCompletionEmail } from './email.js';
export type { JobCompletionEmail } from './email.js';
