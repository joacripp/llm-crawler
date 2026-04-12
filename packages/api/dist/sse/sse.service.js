var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
let SseService = class SseService {
    subscriber = null;
    callbacks = new Map();
    getSubscriber() {
        if (!this.subscriber) {
            const url = process.env.REDIS_URL;
            if (!url)
                throw new Error('REDIS_URL env var is required');
            this.subscriber = new Redis(url);
            this.subscriber.on('message', (channel, message) => {
                const cbs = this.callbacks.get(channel);
                if (cbs)
                    for (const cb of cbs)
                        cb(message);
            });
        }
        return this.subscriber;
    }
    async subscribe(jobId, callback) {
        const channel = `job:${jobId}`;
        const redis = this.getSubscriber();
        if (!this.callbacks.has(channel)) {
            this.callbacks.set(channel, new Set());
            await redis.subscribe(channel);
        }
        this.callbacks.get(channel).add(callback);
    }
    async unsubscribe(jobId, callback) {
        const channel = `job:${jobId}`;
        const cbs = this.callbacks.get(channel);
        if (callback && cbs) {
            cbs.delete(callback);
            if (cbs.size > 0)
                return;
        }
        this.callbacks.delete(channel);
        await this.getSubscriber().unsubscribe(channel);
    }
    async onModuleDestroy() { if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
    } }
};
SseService = __decorate([
    Injectable()
], SseService);
export { SseService };
//# sourceMappingURL=sse.service.js.map