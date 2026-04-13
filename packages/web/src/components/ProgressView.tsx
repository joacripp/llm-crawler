import { useState, useEffect } from 'react';

interface ProgressViewProps {
  pagesFound: number;
  status: 'connecting' | 'running' | 'completed' | 'error';
  rootUrl?: string;
  latestUrls: string[];
  startedAt: number | null;
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

export default function ProgressView({ pagesFound, status, rootUrl, latestUrls, startedAt }: ProgressViewProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || status !== 'running') return;
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt, status]);

  return (
    <div className="space-y-6">
      {rootUrl && (
        <div className="rounded-lg bg-slate-100 px-4 py-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Crawling</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800 truncate">{rootUrl}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-3 py-4">
        {status === 'connecting' && (
          <p className="text-sm text-slate-500 animate-pulse">Connecting to crawl stream...</p>
        )}

        {status === 'running' && (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
            <div className="text-center">
              <p className="text-3xl font-bold text-indigo-600">{pagesFound}</p>
              <p className="text-sm text-slate-500">sub-pages discovered</p>
            </div>
            {startedAt && <p className="text-xs text-slate-400">{formatElapsed(elapsed)} elapsed</p>}
          </>
        )}

        {status === 'error' && (
          <div className="text-center">
            <p className="text-sm text-red-600">Connection lost</p>
            <p className="text-xs text-slate-400 mt-1">Refresh to reconnect</p>
          </div>
        )}
      </div>

      {latestUrls.length > 0 && status === 'running' && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Latest sub-pages</p>
          <div className="space-y-1">
            {latestUrls.map((url, i) => (
              <div
                key={url}
                className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs border border-slate-100"
                style={{ opacity: 1 - i * 0.1 }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-slate-600 truncate">{shortenUrl(url)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
