import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

const mockSignup = vi.fn();
const mockValidateUser = vi.fn();
const mockGenerateTokens = vi.fn(() => ({ accessToken: 'access.jwt', refreshToken: 'refresh.jwt' }));
const mockVerifyRefreshToken = vi.fn();
const mockLinkToUser = vi.fn();

const authService = {
  signup: mockSignup,
  validateUser: mockValidateUser,
  generateTokens: mockGenerateTokens,
  verifyRefreshToken: mockVerifyRefreshToken,
};
const sessionService = { linkToUser: mockLinkToUser };

const { AuthController } = await import('../src/auth/auth.controller.js');

interface CookieCall {
  name: string;
  value: string;
  opts: any;
}

function makeRes() {
  const cookies: CookieCall[] = [];
  const cleared: string[] = [];
  return {
    cookies,
    cleared,
    cookie: vi.fn((name: string, value: string, opts: any) => {
      cookies.push({ name, value, opts });
    }),
    clearCookie: vi.fn((name: string) => {
      cleared.push(name);
    }),
    req: { sessionId: 'sess-1' },
  };
}

describe('AuthController', () => {
  let controller: InstanceType<typeof AuthController>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
    controller = new AuthController(authService as any, sessionService as any);
  });

  describe('me', () => {
    it('returns user info from request', async () => {
      const req = { user: { id: 'user-1', email: 'a@b.com' } } as any;
      expect(await controller.me(req)).toEqual({ id: 'user-1', email: 'a@b.com' });
    });
  });

  describe('signup', () => {
    it('creates user, links session, sets token cookies', async () => {
      mockSignup.mockResolvedValue({ id: 'user-1', email: 'new@example.com' });
      const res = makeRes();
      const result = await controller.signup({ email: 'new@example.com', password: 'pw' } as any, res as any);

      expect(mockSignup).toHaveBeenCalledWith('new@example.com', 'pw');
      expect(mockLinkToUser).toHaveBeenCalledWith('sess-1', 'user-1');
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.cookies.map((c) => c.name).sort()).toEqual(['access_token', 'refresh_token']);
      expect(result).toEqual({ id: 'user-1', email: 'new@example.com' });
    });

    it('skips session linking when no sessionId on request', async () => {
      mockSignup.mockResolvedValue({ id: 'user-1', email: 'new@example.com' });
      const res = makeRes();
      res.req = { sessionId: undefined } as any;
      await controller.signup({ email: 'new@example.com', password: 'pw' } as any, res as any);
      expect(mockLinkToUser).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues tokens on valid credentials', async () => {
      mockValidateUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      const res = makeRes();
      const result = await controller.login({ email: 'a@b.com', password: 'pw' } as any, res as any);

      expect(mockValidateUser).toHaveBeenCalledWith('a@b.com', 'pw');
      expect(mockLinkToUser).toHaveBeenCalledWith('sess-1', 'user-1');
      expect(res.cookies).toHaveLength(2);
      expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
    });

    it('throws UnauthorizedException on invalid credentials', async () => {
      mockValidateUser.mockResolvedValue(null);
      const res = makeRes();
      await expect(controller.login({ email: 'a@b.com', password: 'bad' } as any, res as any)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('issues new tokens for a valid refresh token', async () => {
      mockVerifyRefreshToken.mockReturnValue({ sub: 'user-1', email: 'a@b.com' });
      const req = { cookies: { refresh_token: 'good.refresh' } } as any;
      const res = makeRes();
      const result = await controller.refresh(req, res as any);

      expect(mockVerifyRefreshToken).toHaveBeenCalledWith('good.refresh');
      expect(mockGenerateTokens).toHaveBeenCalledWith({ id: 'user-1', email: 'a@b.com' });
      expect(res.cookies).toHaveLength(2);
      expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
    });

    it('throws when no refresh cookie present', async () => {
      const req = { cookies: {} } as any;
      const res = makeRes();
      await expect(controller.refresh(req, res as any)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when refresh token is invalid', async () => {
      mockVerifyRefreshToken.mockReturnValue(null);
      const req = { cookies: { refresh_token: 'bad' } } as any;
      const res = makeRes();
      await expect(controller.refresh(req, res as any)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears both token cookies', async () => {
      const res = makeRes();
      const result = await controller.logout(res as any);
      expect(res.cleared.sort()).toEqual(['access_token', 'refresh_token']);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('cookie attributes', () => {
    it('uses sameSite=lax and secure=false outside production', async () => {
      mockSignup.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      const res = makeRes();
      await controller.signup({ email: 'a@b.com', password: 'pw' } as any, res as any);
      const access = res.cookies.find((c) => c.name === 'access_token')!;
      expect(access.opts.sameSite).toBe('lax');
      expect(access.opts.secure).toBe(false);
      expect(access.opts.httpOnly).toBe(true);
    });

    it('uses sameSite=none and secure=true in production', async () => {
      process.env.NODE_ENV = 'production';
      mockSignup.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      const res = makeRes();
      await controller.signup({ email: 'a@b.com', password: 'pw' } as any, res as any);
      const refresh = res.cookies.find((c) => c.name === 'refresh_token')!;
      expect(refresh.opts.sameSite).toBe('none');
      expect(refresh.opts.secure).toBe(true);
      expect(refresh.opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
