import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startServer, stopServer, api, cleanDatabase, extractCookies } from './setup.js';

async function signupAndGetCookies(email: string): Promise<string[]> {
  const res = await api('POST', '/api/auth/signup', { body: { email, password: 'password123' } });
  return extractCookies(res.cookies);
}

describe('Job endpoints (integration)', () => {
  beforeAll(async () => {
    await startServer();
  }, 30000);

  afterAll(async () => {
    await cleanDatabase();
    await stopServer();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/jobs', () => {
    it('creates a job for authenticated user', async () => {
      const cookies = await signupAndGetCookies('jobs@example.com');
      const res = await api('POST', '/api/jobs', {
        body: { url: 'https://example.com', maxDepth: 2, maxPages: 10 },
        cookies,
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.rootUrl).toBe('https://example.com');
      expect(res.body.maxDepth).toBe(2);
      expect(res.body.maxPages).toBe(10);
      expect(res.body.status).toBe('pending');
    });

    it('creates a job for anonymous user (first job)', async () => {
      const res = await api('POST', '/api/jobs', { body: { url: 'https://example.com' } });
      expect(res.status).toBe(201);
    });

    it('rejects second anonymous job (signup required)', async () => {
      const first = await api('POST', '/api/jobs', { body: { url: 'https://example.com' } });
      expect(first.status).toBe(201);
      const cookies = extractCookies(first.cookies);

      const second = await api('POST', '/api/jobs', { body: { url: 'https://example.com/other' }, cookies });
      expect(second.status).toBe(403);
      expect(second.body.reason).toBe('signup_required');
    });

    it('allows authenticated user to create multiple jobs', async () => {
      const cookies = await signupAndGetCookies('multi@example.com');
      const first = await api('POST', '/api/jobs', { body: { url: 'https://example.com' }, cookies });
      expect(first.status).toBe(201);
      const second = await api('POST', '/api/jobs', { body: { url: 'https://example.org' }, cookies });
      expect(second.status).toBe(201);
    });

    it('rejects private/internal URLs (SSRF protection)', async () => {
      const cookies = await signupAndGetCookies('validate@example.com');
      const res = await api('POST', '/api/jobs', {
        body: { url: 'https://169.254.169.254/latest/meta-data/' },
        cookies,
      });
      expect(res.status).toBe(400);
    });

    it('rejects localhost', async () => {
      const cookies = await signupAndGetCookies('localhost@example.com');
      const res = await api('POST', '/api/jobs', { body: { url: 'https://localhost/admin' }, cookies });
      expect(res.status).toBe(400);
    });

    it('validates maxDepth bounds', async () => {
      const cookies = await signupAndGetCookies('bounds@example.com');
      const res = await api('POST', '/api/jobs', { body: { url: 'https://example.com', maxDepth: 999 }, cookies });
      expect(res.status).toBe(400);
    });

    it('uses defaults when maxDepth/maxPages not provided', async () => {
      const cookies = await signupAndGetCookies('defaults@example.com');
      const res = await api('POST', '/api/jobs', { body: { url: 'https://example.com' }, cookies });
      expect(res.status).toBe(201);
      expect(res.body.maxDepth).toBe(10);
      expect(res.body.maxPages).toBe(1000);
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('returns job by ID', async () => {
      const cookies = await signupAndGetCookies('getjob@example.com');
      const create = await api('POST', '/api/jobs', { body: { url: 'https://example.com' }, cookies });
      const res = await api('GET', `/api/jobs/${create.body.id}`, { cookies });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(create.body.id);
    });

    it('returns 404 for non-existent job', async () => {
      const res = await api('GET', '/api/jobs/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/jobs (list)', () => {
    it('lists jobs for authenticated user', async () => {
      const cookies = await signupAndGetCookies('list@example.com');
      await api('POST', '/api/jobs', { body: { url: 'https://example.com' }, cookies });
      await api('POST', '/api/jobs', { body: { url: 'https://example.org' }, cookies });
      const res = await api('GET', '/api/jobs', { cookies });
      expect(res.status).toBe(200);
      expect((res.body as unknown as unknown[]).length).toBe(2);
    });

    it('requires authentication', async () => {
      const res = await api('GET', '/api/jobs');
      expect(res.status).toBe(401);
    });

    it('does not leak other users jobs', async () => {
      const cookies1 = await signupAndGetCookies('user1@example.com');
      const cookies2 = await signupAndGetCookies('user2@example.com');
      await api('POST', '/api/jobs', { body: { url: 'https://example.com' }, cookies: cookies1 });
      const res = await api('GET', '/api/jobs', { cookies: cookies2 });
      expect(res.status).toBe(200);
      expect((res.body as unknown as unknown[]).length).toBe(0);
    });
  });
});
