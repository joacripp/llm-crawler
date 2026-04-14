import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLookup = vi.fn();
vi.mock('dns/promises', () => ({ lookup: mockLookup }));

const { verifyUrlDns } = await import('../src/jobs/url-safety.js');

describe('verifyUrlDns', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('allows public IPs', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const result = await verifyUrlDns('https://example.com');
    expect(result).toEqual({ ok: true });
  });

  it('blocks DNS rebinding to 127.x (loopback)', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    const result = await verifyUrlDns('https://evil.com');
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('private network');
  });

  it('blocks DNS rebinding to 169.254.x (AWS metadata)', async () => {
    mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
    const result = await verifyUrlDns('https://evil.com');
    expect(result.ok).toBe(false);
  });

  it('blocks DNS rebinding to 10.x (private)', async () => {
    mockLookup.mockResolvedValue({ address: '10.0.1.50', family: 4 });
    const result = await verifyUrlDns('https://evil.com');
    expect(result.ok).toBe(false);
  });

  it('blocks IP literal 169.254.169.254', async () => {
    const result = await verifyUrlDns('https://169.254.169.254/latest/');
    expect(result.ok).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('returns friendly error on DNS failure', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await verifyUrlDns('https://nonexistent.invalid');
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('Could not resolve');
  });

  it('returns error for invalid URL', async () => {
    const result = await verifyUrlDns('not a url at all');
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('Invalid URL');
  });
});
