import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindSession = vi.fn();
const mockCreateSession = vi.fn();

const sessionService = {
  findSession: mockFindSession,
  createSession: mockCreateSession,
};

const { SessionMiddleware } = await import('../src/session/session.middleware.js');

function makeRes() {
  return {
    cookieCalls: [] as Array<{ name: string; value: string; opts: any }>,
    cookie: vi.fn(function (this: any, name: string, value: string, opts: any) {
      this.cookieCalls.push({ name, value, opts });
    }),
  };
}

describe('SessionMiddleware', () => {
  let middleware: InstanceType<typeof SessionMiddleware>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    middleware = new SessionMiddleware(sessionService as any);
  });

  it('reuses existing session when cookie present and valid', async () => {
    mockFindSession.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
    const req: any = { cookies: { session_id: 'sess-1' } };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as any, next);

    expect(mockFindSession).toHaveBeenCalledWith('sess-1');
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(req.sessionId).toBe('sess-1');
    expect(req.sessionUserId).toBe('user-1');
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('creates a new session when no cookie present', async () => {
    mockCreateSession.mockResolvedValue({ id: 'new-sess' });
    const req: any = { cookies: {} };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as any, next);

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(req.sessionId).toBe('new-sess');
    expect(req.sessionUserId).toBeNull();
    expect(res.cookieCalls[0].name).toBe('session_id');
    expect(res.cookieCalls[0].value).toBe('new-sess');
    expect(res.cookieCalls[0].opts.httpOnly).toBe(true);
    expect(res.cookieCalls[0].opts.sameSite).toBe('lax');
    expect(res.cookieCalls[0].opts.secure).toBe(false);
    expect(res.cookieCalls[0].opts.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    expect(next).toHaveBeenCalledOnce();
  });

  it('creates a new session when cookie is stale (session not found)', async () => {
    mockFindSession.mockResolvedValue(null);
    mockCreateSession.mockResolvedValue({ id: 'fresh-sess' });
    const req: any = { cookies: { session_id: 'expired' } };
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as any, next);

    expect(mockFindSession).toHaveBeenCalledWith('expired');
    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(req.sessionId).toBe('fresh-sess');
    expect(res.cookieCalls).toHaveLength(1);
  });

  it('uses sameSite=none and secure=true in production', async () => {
    process.env.NODE_ENV = 'production';
    mockCreateSession.mockResolvedValue({ id: 'prod-sess' });
    const req: any = { cookies: {} };
    const res = makeRes();
    await middleware.use(req, res as any, vi.fn());

    expect(res.cookieCalls[0].opts.sameSite).toBe('none');
    expect(res.cookieCalls[0].opts.secure).toBe(true);
  });

  it('handles missing cookies object on request', async () => {
    mockCreateSession.mockResolvedValue({ id: 'sess-x' });
    const req: any = {};
    const res = makeRes();
    const next = vi.fn();

    await middleware.use(req, res as any, next);

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(req.sessionId).toBe('sess-x');
    expect(next).toHaveBeenCalledOnce();
  });
});
