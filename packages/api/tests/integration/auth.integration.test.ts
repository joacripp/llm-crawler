import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startServer, stopServer, api, cleanDatabase, extractCookies } from './setup.js';

describe('Auth endpoints (integration)', () => {
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

  describe('POST /api/auth/signup', () => {
    it('creates a user and returns cookies', async () => {
      const res = await api('POST', '/api/auth/signup', {
        body: { email: 'test@example.com', password: 'password123' },
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('test@example.com');
      expect(res.cookies.join(' ')).toContain('access_token');
      expect(res.cookies.join(' ')).toContain('refresh_token');
    });

    it('rejects duplicate email', async () => {
      await api('POST', '/api/auth/signup', { body: { email: 'dup@example.com', password: 'password123' } });
      const res = await api('POST', '/api/auth/signup', {
        body: { email: 'dup@example.com', password: 'password123' },
      });
      expect(res.status).toBe(409);
    });

    it('rejects invalid email', async () => {
      const res = await api('POST', '/api/auth/signup', { body: { email: 'not-an-email', password: 'password123' } });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await api('POST', '/api/auth/signup', { body: { email: 'login@example.com', password: 'password123' } });
    });

    it('authenticates with correct credentials', async () => {
      const res = await api('POST', '/api/auth/login', {
        body: { email: 'login@example.com', password: 'password123' },
      });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe('login@example.com');
    });

    it('rejects wrong password', async () => {
      const res = await api('POST', '/api/auth/login', {
        body: { email: 'login@example.com', password: 'wrongpassword' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('full auth cycle: signup → me → refresh → logout → me', () => {
    it('completes the full lifecycle', async () => {
      // 1. Signup
      const signup = await api('POST', '/api/auth/signup', {
        body: { email: 'cycle@example.com', password: 'password123' },
      });
      expect(signup.status).toBe(201);
      const cookies = extractCookies(signup.cookies);

      // 2. GET /me
      const me = await api('GET', '/api/auth/me', { cookies });
      expect(me.status).toBe(200);
      expect(me.body.email).toBe('cycle@example.com');

      // 3. Refresh
      const refresh = await api('POST', '/api/auth/refresh', { cookies });
      expect(refresh.status).toBe(201);
      const newCookies = extractCookies(refresh.cookies);

      // 4. Logout
      const logout = await api('POST', '/api/auth/logout', { cookies: newCookies });
      expect(logout.status).toBe(201);
      expect(logout.body).toEqual({ ok: true });

      // 5. GET /me without cookies should fail
      const meAfter = await api('GET', '/api/auth/me');
      expect(meAfter.status).toBe(401);
    });
  });
});
