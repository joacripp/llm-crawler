import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, SignupRequiredError } from '../src/api.js';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('api', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  describe('createJob', () => {
    it('sends POST with body and credentials', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'job-1' }));
      const result = await api.createJob({ url: 'https://example.com', maxDepth: 2, maxPages: 50 });
      expect(mockFetch).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ url: 'https://example.com', maxDepth: 2, maxPages: 50 }),
      }));
      expect(result.id).toBe('job-1');
    });

    it('throws SignupRequiredError when 401 + reason=signup_required', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ reason: 'signup_required' }, { ok: false, status: 401 }));
      await expect(api.createJob({ url: 'https://example.com' })).rejects.toBeInstanceOf(SignupRequiredError);
    });

    it('throws SignupRequiredError when 403 + reason=signup_required', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ reason: 'signup_required' }, { ok: false, status: 403 }));
      await expect(api.createJob({ url: 'https://example.com' })).rejects.toBeInstanceOf(SignupRequiredError);
    });

    it('throws generic Error with message on other failures', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, { ok: false, status: 500 }));
      await expect(api.createJob({ url: 'https://example.com' })).rejects.toThrow('boom');
    });
  });

  describe('401 refresh-and-retry', () => {
    it('refreshes token and retries the original request on 401', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, { ok: false, status: 401 }))  // first call: 401
        .mockResolvedValueOnce(jsonResponse({ ok: true }))                                          // /auth/refresh: ok
        .mockResolvedValueOnce(jsonResponse({ id: 'user-1', email: 'a@b.com' }));                  // retry: success

      const result = await api.me();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/me');
      expect(mockFetch.mock.calls[1][0]).toBe('/api/auth/refresh');
      expect(mockFetch.mock.calls[2][0]).toBe('/api/auth/me');
      expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
    });

    it('throws when refresh fails', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, { ok: false, status: 401 }))
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }));  // refresh fails

      await expect(api.me()).rejects.toThrow('expired');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getContent', () => {
    it('returns body text on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('# llms.txt\n'),
      });
      expect(await api.getContent('job-1')).toBe('# llms.txt\n');
      expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job-1/content', { credentials: 'include' });
    });

    it('returns null on non-2xx', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await api.getContent('job-1')).toBeNull();
    });
  });

  describe('auth endpoints', () => {
    it('signup posts email + password', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'user-1', email: 'a@b.com' }));
      const result = await api.signup('a@b.com', 'password123');
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'password123' }),
      }));
      expect(result.id).toBe('user-1');
    });

    it('login posts email + password', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'user-1', email: 'a@b.com' }));
      await api.login('a@b.com', 'password123');
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    });

    it('logout posts with no body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
      const result = await api.logout();
      expect(result.ok).toBe(true);
    });
  });
});
