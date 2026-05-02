import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../src/api.js', () => ({
  api: { getJob: vi.fn() },
}));

const { api } = await import('../src/api.js');
const { useJobStream } = await import('../src/hooks/useJobStream.js');
const getJob = api.getJob as ReturnType<typeof vi.fn>;

describe('useJobStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial connecting state when no jobId', () => {
    const { result } = renderHook(() => useJobStream(null));
    expect(result.current.status).toBe('connecting');
    expect(result.current.pagesFound).toBe(0);
    expect(getJob).not.toHaveBeenCalled();
  });

  it('polls immediately when jobId provided', async () => {
    getJob.mockResolvedValue({ status: 'running', pagesFound: 5 });
    const { result } = renderHook(() => useJobStream('abc-123'));

    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(result.current.pagesFound).toBe(5);
    expect(getJob).toHaveBeenCalledWith('abc-123');
  });

  it('transitions to completed status', async () => {
    getJob.mockResolvedValue({ status: 'completed', pagesFound: 42 });
    const { result } = renderHook(() => useJobStream('abc'));

    await waitFor(() => expect(result.current.status).toBe('completed'));
    expect(result.current.pagesFound).toBe(42);
  });

  it('transitions to error on failed status', async () => {
    getJob.mockResolvedValue({ status: 'failed', pagesFound: 0 });
    const { result } = renderHook(() => useJobStream('abc'));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('does not poll when jobId is null', () => {
    renderHook(() => useJobStream(null));
    expect(getJob).not.toHaveBeenCalled();
  });

  it('stops polling on unmount', async () => {
    getJob.mockResolvedValue({ status: 'running', pagesFound: 1 });
    const { unmount } = renderHook(() => useJobStream('abc'));
    await waitFor(() => expect(getJob).toHaveBeenCalled());

    unmount();
    const callCount = getJob.mock.calls.length;
    await new Promise((r) => setTimeout(r, 2500));
    expect(getJob.mock.calls.length).toBe(callCount);
  });
});
