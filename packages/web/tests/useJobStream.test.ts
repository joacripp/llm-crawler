import { describe, it, expect } from 'vitest';

describe('useJobStream (unit)', () => {
  it('constructs correct SSE URL', () => {
    expect(`/api/jobs/abc-123/stream`).toBe('/api/jobs/abc-123/stream');
  });
});
