import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock('@llm-crawler/shared', () => ({
  getPrisma: vi.fn(() => ({ user: { findUnique: mockFindUnique, findFirst: mockFindFirst, create: mockCreate } })),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi
      .fn()
      .mockImplementation((plain, hash) => Promise.resolve(hash === 'hashed_password' && plain === 'password123')),
  },
}));

const mockSign = vi.fn().mockReturnValue('mock.jwt.token');
const mockJwtService = { sign: mockSign };

const { AuthService } = await import('../src/auth/auth.service.js');

describe('AuthService', () => {
  let service: InstanceType<typeof AuthService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(mockJwtService as any);
  });

  it('creates a user with hashed password', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    const user = await service.signup('test@example.com', 'password123');
    expect(mockCreate).toHaveBeenCalledWith({ data: { email: 'test@example.com', passwordHash: 'hashed_password' } });
    expect(user.id).toBe('user-1');
  });

  it('throws on duplicate email', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    await expect(service.signup('test@example.com', 'pass')).rejects.toThrow('Email already registered');
  });

  it('validates correct password', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com', passwordHash: 'hashed_password' });
    const user = await service.validateUser('test@example.com', 'password123');
    expect(user?.id).toBe('user-1');
  });

  it('returns null for wrong password', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com', passwordHash: 'hashed_password' });
    const user = await service.validateUser('test@example.com', 'wrong');
    expect(user).toBeNull();
  });

  it('generates JWT tokens', () => {
    const tokens = service.generateTokens({ id: 'user-1', email: 'test@example.com' });
    expect(tokens.accessToken).toBe('mock.jwt.token');
    expect(tokens.refreshToken).toBe('mock.jwt.token');
    expect(mockSign).toHaveBeenCalledTimes(2);
  });

  describe('findOrCreateOAuthUser', () => {
    it('returns existing user when OAuth provider + ID match', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'g@example.com',
        oauthProvider: 'google',
        oauthId: '123',
      });
      const user = await service.findOrCreateOAuthUser({
        oauthProvider: 'google',
        oauthId: '123',
        email: 'g@example.com',
      });
      expect(user.id).toBe('user-1');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('creates new user when no matching OAuth account exists', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: 'user-2', email: 'new@example.com', oauthProvider: 'google', oauthId: '456' });
      const user = await service.findOrCreateOAuthUser({
        oauthProvider: 'google',
        oauthId: '456',
        email: 'new@example.com',
      });
      expect(mockCreate).toHaveBeenCalledWith({
        data: { email: 'new@example.com', oauthProvider: 'google', oauthId: '456' },
      });
      expect(user.id).toBe('user-2');
    });

    it('throws when email is already taken by a password-based account', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockFindUnique.mockResolvedValue({ id: 'user-1', email: 'taken@example.com', passwordHash: 'hashed' });
      await expect(
        service.findOrCreateOAuthUser({ oauthProvider: 'google', oauthId: '789', email: 'taken@example.com' }),
      ).rejects.toThrow('An account with this email already exists');
    });
  });
});
