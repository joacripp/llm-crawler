import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer, api } from './setup.js';

describe('Health endpoints (integration)', () => {
  beforeAll(async () => {
    await startServer();
  }, 30000);

  afterAll(async () => {
    await stopServer();
  });

  it('GET /api/health returns ok', async () => {
    const res = await api('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready checks DB and Redis', async () => {
    const res = await api('GET', '/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toHaveProperty('db', 'ok');
    expect(res.body.checks).toHaveProperty('redis', 'ok');
  });

  it('health endpoints do not set session cookies', async () => {
    const res = await api('GET', '/api/health');
    const sessionCookies = res.cookies.filter((c) => c.includes('session_id'));
    expect(sessionCookies).toHaveLength(0);
  });
});
