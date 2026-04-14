import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dns/promises before importing fetcher
const mockLookup = vi.fn();
vi.mock('dns/promises', () => ({ lookup: mockLookup }));

// Mock axios
const mockAxiosGet = vi.fn();
vi.mock('axios', () => ({ default: { get: mockAxiosGet } }));

vi.mock('@llm-crawler/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { fetchWithAxios } = await import('../src/fetcher.js');

describe('fetchWithAxios SSRF protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a public URL normally', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockAxiosGet.mockResolvedValue({
      data: '<html><body>Hello</body></html>',
      headers: { 'content-type': 'text/html' },
    });

    const result = await fetchWithAxios('https://example.com/');
    expect(result).toContain('Hello');
    expect(mockLookup).toHaveBeenCalledWith('example.com');
    expect(mockAxiosGet).toHaveBeenCalled();
  });

  it('blocks DNS rebinding to localhost (127.x)', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });

    const result = await fetchWithAxios('https://evil.com/steal-creds');
    expect(result).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('blocks DNS rebinding to AWS metadata (169.254.x)', async () => {
    mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });

    const result = await fetchWithAxios('https://evil.com/latest/meta-data/');
    expect(result).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('blocks DNS rebinding to private network (10.x)', async () => {
    mockLookup.mockResolvedValue({ address: '10.0.1.50', family: 4 });

    const result = await fetchWithAxios('https://evil.com/internal-api');
    expect(result).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('blocks DNS rebinding to private network (172.16.x)', async () => {
    mockLookup.mockResolvedValue({ address: '172.16.0.1', family: 4 });

    const result = await fetchWithAxios('https://evil.com/');
    expect(result).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('blocks DNS rebinding to private network (192.168.x)', async () => {
    mockLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });

    const result = await fetchWithAxios('https://evil.com/');
    expect(result).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('blocks IP literal in URL pointing to private range', async () => {
    const result = await fetchWithAxios('https://169.254.169.254/latest/meta-data/');
    expect(result).toBeNull();
    expect(mockLookup).not.toHaveBeenCalled(); // skip DNS for IP literals
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('returns null when DNS resolution fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));

    const result = await fetchWithAxios('https://nonexistent.invalid/');
    expect(result).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });
});
