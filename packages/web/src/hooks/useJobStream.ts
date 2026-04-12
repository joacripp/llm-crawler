import { useEffect, useState, useRef } from 'react';

interface StreamState {
  pagesFound: number;
  status: 'connecting' | 'running' | 'completed' | 'error';
  downloadUrl?: string;
}

export function useJobStream(jobId: string | null): StreamState {
  const [state, setState] = useState<StreamState>({ pagesFound: 0, status: 'connecting' });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    sourceRef.current = source;

    source.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setState({ pagesFound: data.pagesFound, status: 'running' });
    });

    source.addEventListener('completed', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({ pagesFound: data.pagesFound ?? prev.pagesFound, status: 'completed', downloadUrl: data.downloadUrl }));
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
