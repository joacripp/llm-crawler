import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

type MessageCallback = (message: string) => void;

@Injectable()
export class SseService implements OnModuleDestroy {
  private subscriber: Redis | null = null;
  private callbacks = new Map<string, Set<MessageCallback>>();

  private getSubscriber(): Redis {
    if (!this.subscriber) {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error('REDIS_URL env var is required');
      this.subscriber = new Redis(url);
      this.subscriber.on('message', (channel: string, message: string) => {
        const cbs = this.callbacks.get(channel);
        if (cbs) for (const cb of cbs) cb(message);
      });
    }
    return this.subscriber;
  }

  async subscribe(jobId: string, callback: MessageCallback): Promise<void> {
    const channel = `job:${jobId}`;
    const redis = this.getSubscriber();
    if (!this.callbacks.has(channel)) {
      this.callbacks.set(channel, new Set());
      await redis.subscribe(channel);
    }
    this.callbacks.get(channel)!.add(callback);
  }

  async unsubscribe(jobId: string, callback?: MessageCallback): Promise<void> {
    const channel = `job:${jobId}`;
    const cbs = this.callbacks.get(channel);
    if (callback && cbs) {
      cbs.delete(callback);
      if (cbs.size > 0) return;
    }
    this.callbacks.delete(channel);
    await this.getSubscriber().unsubscribe(channel);
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
