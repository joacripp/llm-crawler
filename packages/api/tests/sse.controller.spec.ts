import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { firstValueFrom, take, toArray } from 'rxjs';
import type { Request } from 'express';

type Cb = (msg: string) => void;

const subscribed: Array<{ jobId: string; cb: Cb }> = [];
const unsubscribed: Array<{ jobId: string; cb?: Cb }> = [];

const sseService = {
  subscribe: vi.fn(async (jobId: string, cb: Cb) => {
    subscribed.push({ jobId, cb });
  }),
  unsubscribe: vi.fn(async (jobId: string, cb?: Cb) => {
    unsubscribed.push({ jobId, cb });
  }),
};

const { SseController } = await import('../src/sse/sse.controller.js');

function makeReq(): Request & EventEmitter {
  // Express request behaves like an EventEmitter; we only need `on('close', …)`.
  return new EventEmitter() as Request & EventEmitter;
}

describe('SseController', () => {
  let controller: InstanceType<typeof SseController>;

  beforeEach(() => {
    vi.clearAllMocks();
    subscribed.length = 0;
    unsubscribed.length = 0;
    controller = new SseController(sseService as any);
  });

  it('subscribes to the job channel on stream open', async () => {
    controller.stream('job-1', makeReq());
    await Promise.resolve();
    expect(sseService.subscribe).toHaveBeenCalledWith('job-1', expect.any(Function));
    expect(subscribed[0].jobId).toBe('job-1');
  });

  it('emits parsed JSON messages with type field', async () => {
    const obs$ = controller.stream('job-2', makeReq());
    const collected = firstValueFrom(obs$.pipe(take(2), toArray()));

    await Promise.resolve();
    const cb = subscribed[0].cb;
    cb(JSON.stringify({ type: 'progress', pagesFound: 5 }));
    cb(JSON.stringify({ type: 'completed', downloadUrl: 'https://x/y' }));

    const events = await collected;
    expect(events[0]).toEqual({ data: { type: 'progress', pagesFound: 5 }, type: 'progress' });
    expect(events[1]).toEqual({ data: { type: 'completed', downloadUrl: 'https://x/y' }, type: 'completed' });
  });

  it('silently drops non-JSON messages', async () => {
    const obs$ = controller.stream('job-3', makeReq());
    const collected = firstValueFrom(obs$.pipe(take(1), toArray()));

    await Promise.resolve();
    const cb = subscribed[0].cb;
    cb('not-json');
    cb(JSON.stringify({ type: 'progress', pagesFound: 1 }));

    const events = await collected;
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ type: 'progress', pagesFound: 1 });
  });

  it('unsubscribes from SseService when the client disconnects', async () => {
    const req = makeReq();
    controller.stream('job-4', req);
    await Promise.resolve();

    const cb = subscribed[0].cb;
    expect(sseService.unsubscribe).not.toHaveBeenCalled();

    req.emit('close');

    expect(sseService.unsubscribe).toHaveBeenCalledWith('job-4', cb);
  });

  it('returns an Observable (not the raw Subject)', () => {
    const obs$ = controller.stream('job-5', makeReq());
    expect((obs$ as any).next).toBeUndefined();
    expect(typeof obs$.subscribe).toBe('function');
  });
});
