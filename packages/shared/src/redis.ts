import Redis from 'ioredis';
import type { RedisJobMessage } from './types.js';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL env var is required');
    redis = new Redis(url);
  }
  return redis;
}

export async function publishJobUpdate(jobId: string, message: RedisJobMessage): Promise<void> {
  const client = getRedis();
  await client.publish(`job:${jobId}`, JSON.stringify(message));
}

export async function disconnectRedis(): Promise<void> {
  if (redis) { await redis.quit(); redis = null; }
}
