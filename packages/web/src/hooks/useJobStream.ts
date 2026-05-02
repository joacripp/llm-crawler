import { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = () => {
      api
        .getJob(jobId)
        .then((job) => {
          setState((prev) => ({
            pagesFound: job.pagesFound,
            status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'error' : 'running',
            latestUrls: prev.latestUrls,
            startedAt: prev.startedAt ?? Date.now(),
          }));
          if (job.status === 'completed' || job.status === 'failed') {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        })
        .catch(() => {});
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  return state;
}
