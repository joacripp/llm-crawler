import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../src/api.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('api', () => {
  beforeEach(() => { mockFetch.mockClear(); });

  it('createJob sends POST', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'job-1' }) });
    const result = await api.createJob({ url: 'https://example.com' });
    expect(mockFetch).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({ method: 'POST' }));
    expect(result.id).toBe('job-1');
  });

  it('getJob fetches status', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'job-1', status: 'running', pagesFound: 42 }) });
    const result = await api.getJob('job-1');
    expect(result.pagesFound).toBe(42);
  });

  it('throws on signup_required', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ reason: 'signup_required' }) });
    await expect(api.createJob({ url: 'https://example.com' })).rejects.toThrow('signup_required');
  });

  it('signup sends POST', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'user-1', email: 'a@b.com' }) });
    const result = await api.signup('a@b.com', 'password123');
    expect(result.id).toBe('user-1');
  });
});
