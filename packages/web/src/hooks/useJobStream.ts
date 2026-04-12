import { useEffect, useState, useRef, useCallback } from 'react';

interface StreamState {
  pagesFound: number;
  status: 'connecting' | 'running' | 'completed' | 'error';
  latestUrls: string[];
  startedAt: number | null;
}

export function useJobStream(jobId: string | null): StreamState {
  const [state, setState] = useState<StreamState>({
    pagesFound: 0,
    status: 'connecting',
    latestUrls: [],
    startedAt: null,
  });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    sourceRef.current = source;

    source.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => {
        const latestUrls = data.url
          ? [data.url, ...prev.latestUrls].slice(0, 8)
          : prev.latestUrls;
        return {
          pagesFound: data.pagesFound,
          status: 'running',
          latestUrls,
          startedAt: prev.startedAt ?? Date.now(),
        };
      });
    });

    source.addEventListener('completed', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        pagesFound: data.pagesFound ?? prev.pagesFound,
        status: 'completed',
      }));
      source.close();
    });

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
      setState((prev) => ({ ...prev, status: 'error' }));
      source.close();
    };

    return () => { source.close(); sourceRef.current = null; };
  }, [jobId]);

  return state;
}
