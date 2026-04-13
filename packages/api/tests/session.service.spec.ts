import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@llm-crawler/shared', () => ({
  getPrisma: vi.fn(() => ({
    anonSession: { findUnique: mockFindUnique, create: mockCreate, update: mockUpdate },
  })),
}));

const { SessionService } = await import('../src/session/session.service.js');

describe('SessionService', () => {
  let service: InstanceType<typeof SessionService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionService();
  });

  it('creates a new anonymous session', async () => {
    mockCreate.mockResolvedValue({ id: 'sess-1', userId: null });
    const session = await service.createSession();
    expect(mockCreate).toHaveBeenCalled();
    expect(session.id).toBeDefined();
  });

  it('finds existing session by id', async () => {
    mockFindUnique.mockResolvedValue({ id: 'sess-1', userId: null });
    const session = await service.findSession('sess-1');
    expect(session?.id).toBe('sess-1');
  });

  it('returns null for non-existent session', async () => {
    mockFindUnique.mockResolvedValue(null);
    const session = await service.findSession('nonexistent');
    expect(session).toBeNull();
  });

  it('links session to user on signup', async () => {
    mockUpdate.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
    await service.linkToUser('sess-1', 'user-1');
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'sess-1' }, data: { userId: 'user-1' } });
  });
});
