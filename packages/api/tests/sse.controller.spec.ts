import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';

type Cb = (msg: string) => void;

const subscribed: Array<{ jobId: string; cb: Cb }> = [];
const unsubscribed: Array<{ jobId: string; cb?: Cb }> = [];

const sseService = {
  subscribe: vi.fn(async (jobId: string, cb: Cb) => { subscribed.push({ jobId, cb }); }),
  unsubscribe: vi.fn(async (jobId: string, cb?: Cb) => { unsubscribed.push({ jobId, cb }); }),
};

const { SseController } = await import('../src/sse/sse.controller.js');

describe('SseController', () => {
  let controller: InstanceType<typeof SseController>;

  beforeEach(() => {
    vi.clearAllMocks();
    subscribed.length = 0;
    unsubscribed.length = 0;
    controller = new SseController(sseService as any);
  });

  it('subscribes to the job channel on stream open', async () => {
    controller.stream('job-1');
    // subscribe is awaited inside the controller, but we don't await its promise
    // synchronously — flush microtasks to be safe.
    await Promise.resolve();
    expect(sseService.subscribe).toHaveBeenCalledWith('job-1', expect.any(Function));
    expect(subscribed[0].jobId).toBe('job-1');
  });

  it('emits parsed JSON messages with type field', async () => {
    const obs$ = controller.stream('job-2');
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
    const obs$ = controller.stream('job-3');
    const collected = firstValueFrom(obs$.pipe(take(1), toArray()));

    await Promise.resolve();
    const cb = subscribed[0].cb;
    cb('not-json');
    cb(JSON.stringify({ type: 'progress', pagesFound: 1 }));

    const events = await collected;
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ type: 'progress', pagesFound: 1 });
  });

  it('returns an Observable (not the raw Subject)', () => {
    const obs$ = controller.stream('job-5');
    // asObservable() hides the Subject's `next`/`complete` from callers.
    expect((obs$ as any).next).toBeUndefined();
    expect(typeof obs$.subscribe).toBe('function');
  });
});
