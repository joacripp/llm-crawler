import { useEffect, useState, useRef } from 'react';

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

    const apiBase = import.meta.env.VITE_API_URL ?? '';
    const source = new EventSource(`${apiBase}/api/jobs/${jobId}/stream`);
    sourceRef.current = source;

    source.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => {
        const latestUrls = data.url ? [data.url, ...prev.latestUrls].slice(0, 50) : prev.latestUrls;
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
      // Let EventSource auto-reconnect — API Gateway closes the connection after
      // 29s but EventSource will reconnect automatically. Only close permanently
      // if the source has been explicitly shut down (CLOSED state).
      if (source.readyState === EventSource.CLOSED) {
        setState((prev) => ({ ...prev, status: 'error' }));
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [jobId]);

  return state;
}
