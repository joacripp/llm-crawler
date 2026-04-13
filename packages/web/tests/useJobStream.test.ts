import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobStream } from '../src/hooks/useJobStream.js';

// Minimal EventSource stand-in we can drive from tests.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState = FakeEventSource.OPEN;
  onerror: ((ev: any) => void) | null = null;
  private listeners = new Map<string, Set<(ev: any) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.forEach((cb) => cb({ data: JSON.stringify(data) }));
  }

  emitError() {
    // Real EventSource fires onerror before transitioning to CLOSED for transient
    // errors; the hook checks readyState to avoid acting on already-closed sockets.
    this.onerror?.({});
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

describe('useJobStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as any).EventSource = FakeEventSource;
  });
  afterEach(() => {
    delete (globalThis as any).EventSource;
  });

  it('returns initial connecting state when no jobId', () => {
    const { result } = renderHook(() => useJobStream(null));
    expect(result.current.status).toBe('connecting');
    expect(result.current.pagesFound).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('opens an EventSource at the right URL when jobId provided', () => {
    renderHook(() => useJobStream('abc-123'));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/jobs/abc-123/stream');
  });

  it('updates pagesFound, status, and latestUrls on progress events', () => {
    const { result } = renderHook(() => useJobStream('abc-123'));
    const es = FakeEventSource.instances[0];

    act(() => { es.emit('progress', { pagesFound: 1, url: 'https://example.com/' }); });
    expect(result.current.status).toBe('running');
    expect(result.current.pagesFound).toBe(1);
    expect(result.current.latestUrls).toEqual(['https://example.com/']);

    act(() => { es.emit('progress', { pagesFound: 2, url: 'https://example.com/about' }); });
    expect(result.current.pagesFound).toBe(2);
    expect(result.current.latestUrls).toEqual(['https://example.com/about', 'https://example.com/']);
  });

  it('caps latestUrls at 8 entries', () => {
    const { result } = renderHook(() => useJobStream('abc'));
    const es = FakeEventSource.instances[0];

    act(() => {
      for (let i = 0; i < 12; i++) {
        es.emit('progress', { pagesFound: i + 1, url: `https://example.com/${i}` });
      }
    });
    expect(result.current.latestUrls).toHaveLength(8);
    // Most recent is first.
    expect(result.current.latestUrls[0]).toBe('https://example.com/11');
  });

  it('transitions to completed and closes the source on completed event', () => {
    const { result } = renderHook(() => useJobStream('abc'));
    const es = FakeEventSource.instances[0];

    act(() => { es.emit('completed', { pagesFound: 42 }); });
    expect(result.current.status).toBe('completed');
    expect(result.current.pagesFound).toBe(42);
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });

  it('transitions to error state on connection error', () => {
    const { result } = renderHook(() => useJobStream('abc'));
    const es = FakeEventSource.instances[0];

    act(() => { es.emitError(); });
    expect(result.current.status).toBe('error');
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useJobStream('abc'));
    const es = FakeEventSource.instances[0];
    unmount();
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });
});
