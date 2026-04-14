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
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
  });

  it('returns true when the jobs table exists', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ table: 'jobs' }]);
    expect(await pingPrisma()).toBe(true);
    expect(mockQueryRawUnsafe).toHaveBeenCalledWith(`SELECT to_regclass('public.jobs')::text AS "table"`);
  });

  it('returns false when the jobs table is missing (migrations not applied)', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ table: null }]);
    expect(await pingPrisma()).toBe(false);
  });

  it('returns false when the query throws (DB unreachable)', async () => {
    mockQueryRawUnsafe.mockRejectedValue(new Error('connection refused'));
    expect(await pingPrisma()).toBe(false);
  });
});
