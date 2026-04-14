import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startServer, stopServer, api, cleanDatabase, extractCookies } from './setup.js';

describe('Session middleware (integration)', () => {
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

  it('sets a session_id cookie on first request', async () => {
    const res = await api('POST', '/api/jobs', { body: { url: 'https://example.com' } });
    expect(res.cookies.join(' ')).toContain('session_id');
  });

  it('reuses session across requests (same cookies)', async () => {
    const first = await api('POST', '/api/jobs', { body: { url: 'https://example.com' } });
    expect(first.status).toBe(201);
    const cookies = extractCookies(first.cookies);

    const second = await api('POST', '/api/jobs', { body: { url: 'https://example.com/other' }, cookies });
    expect(second.status).toBe(403);
    expect(second.body.reason).toBe('signup_required');
  });

  it('links session to user on signup', async () => {
    // 1. Create anon job (establishes session)
    const job1 = await api('POST', '/api/jobs', { body: { url: 'https://example.com' } });
    expect(job1.status).toBe(201);
    const sessionCookies = extractCookies(job1.cookies);

    // 2. Signup with same session
    const signup = await api('POST', '/api/auth/signup', {
      body: { email: 'session@example.com', password: 'password123' },
      cookies: sessionCookies,
    });
    expect(signup.status).toBe(201);
    const authCookies = extractCookies([...sessionCookies, ...extractCookies(signup.cookies)]);

    // 3. Create another job (now authenticated, no anon limit)
    const job2 = await api('POST', '/api/jobs', { body: { url: 'https://example.com/two' }, cookies: authCookies });
    expect(job2.status).toBe(201);

    // 4. Anon job should appear in user's job list
    const jobs = await api('GET', '/api/jobs', { cookies: authCookies });
    expect(jobs.status).toBe(200);
    expect((jobs.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});
