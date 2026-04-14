import { useState, useEffect } from 'react';

interface ProgressViewProps {
  pagesFound: number;
  status: string;
  rootUrl?: string;
  latestUrls: string[];
  startedAt: number | null;
}

export default function ProgressView({ pagesFound, status, rootUrl, latestUrls, startedAt }: ProgressViewProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="animate-fade-in">
      <div className="card-dark rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Crawling</p>
            <p className="truncate text-sm font-medium text-zinc-200">{rootUrl}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold text-zinc-100">{pagesFound}</p>
            <p className="text-xs text-zinc-500">pages found</p>
          </div>
        </div>
      </div>

      <div className="card-dark mt-4 overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 border-b border-zinc-800/50 px-4 py-2.5">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          </div>
          <span className="ml-2 font-mono text-xs text-zinc-500">
            {status === 'connecting' ? 'connecting...' : `live \u00b7 ${mins}m ${secs.toString().padStart(2, '0')}s`}
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto p-4 font-mono text-xs">
          {latestUrls.length === 0 && <p className="text-zinc-600">Waiting for pages...</p>}
          {latestUrls.map((url, i) => (
            <div key={url} className="animate-slide-up flex gap-2 py-0.5" style={{ opacity: 1 - i * 0.1 }}>
              <span className="text-emerald-500">+</span>
              <span className="truncate text-zinc-400">{url.replace(/^https?:\/\//, '')}</span>
            </div>
          ))}
        </div>
      </div>

      {status === 'error' && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
          Connection lost. Polling for updates...
        </div>
      )}
    </div>
  );
}
