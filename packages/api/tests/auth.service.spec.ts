import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock('@llm-crawler/shared', () => ({
  getPrisma: vi.fn(() => ({ user: { findUnique: mockFindUnique, create: mockCreate } })),
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
});
