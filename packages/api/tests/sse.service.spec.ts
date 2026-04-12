import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();
const mockQuit = vi.fn().mockResolvedValue('OK');

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    subscribe: mockSubscribe, unsubscribe: mockUnsubscribe, on: mockOn, quit: mockQuit,
  })),
}));

const { SseService } = await import('../src/sse/sse.service.js');

describe('SseService', () => {
  let service: InstanceType<typeof SseService>;

  beforeEach(() => { vi.clearAllMocks(); process.env.REDIS_URL = 'redis://localhost:6379'; service = new SseService(); });

  it('subscribes to job channel', async () => {
    await service.subscribe('job-1', vi.fn());
    expect(mockSubscribe).toHaveBeenCalledWith('job:job-1');
  });

  it('unsubscribes from job channel', async () => {
    const cb = vi.fn();
    await service.subscribe('job-1', cb);
    await service.unsubscribe('job-1', cb);
    expect(mockUnsubscribe).toHaveBeenCalledWith('job:job-1');
  });
});
