import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPublish = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue('OK');
const mockPing = vi.fn();
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({ publish: mockPublish, quit: mockQuit, ping: mockPing })),
}));

// Must set env before importing the module so getRedis() can construct
process.env.REDIS_URL = 'redis://localhost:6379';

const { publishJobUpdate, pingRedis } = await import('../src/redis.js');

describe('publishJobUpdate', () => {
  beforeEach(() => { mockPublish.mockClear(); });

  it('publishes progress to job:{jobId} channel', async () => {
    await publishJobUpdate('abc-123', { type: 'progress', pagesFound: 42 });
    expect(mockPublish).toHaveBeenCalledWith('job:abc-123', JSON.stringify({ type: 'progress', pagesFound: 42 }));
  });

  it('publishes completion to job:{jobId} channel', async () => {
    await publishJobUpdate('abc-123', { type: 'completed', downloadUrl: 'https://s3.example.com/llms.txt' });
    expect(mockPublish).toHaveBeenCalledWith('job:abc-123', JSON.stringify({ type: 'completed', downloadUrl: 'https://s3.example.com/llms.txt' }));
  });
});

describe('pingRedis', () => {
  beforeEach(() => { mockPing.mockReset(); });

  it('returns true when PING returns PONG', async () => {
    mockPing.mockResolvedValue('PONG');
    expect(await pingRedis()).toBe(true);
  });

  it('returns false when PING returns anything else', async () => {
    mockPing.mockResolvedValue('NOPE');
    expect(await pingRedis()).toBe(false);
  });

  it('returns false when PING throws', async () => {
    mockPing.mockRejectedValue(new Error('connection refused'));
    expect(await pingRedis()).toBe(false);
  });
});
