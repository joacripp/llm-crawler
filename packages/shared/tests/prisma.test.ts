import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryRawUnsafe = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $queryRawUnsafe: mockQueryRawUnsafe,
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn().mockImplementation((cfg) => cfg),
}));

process.env.DATABASE_URL = 'postgres://test';

const { pingPrisma } = await import('../src/prisma.js');

describe('pingPrisma', () => {
  beforeEach(() => { mockQueryRawUnsafe.mockReset(); });

  it('returns true when SELECT 1 succeeds', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    expect(await pingPrisma()).toBe(true);
    expect(mockQueryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns false when SELECT 1 throws', async () => {
    mockQueryRawUnsafe.mockRejectedValue(new Error('connection refused'));
    expect(await pingPrisma()).toBe(false);
  });
});
