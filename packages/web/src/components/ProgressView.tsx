import { useState, useEffect, useRef } from 'react';

const WIDTHS = [48, 64, 56, 72, 40, 80, 60, 52, 68, 44, 76, 36, 58, 66, 42];

function SkeletonFeed() {
  const [rows, setRows] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({ id: i, w: WIDTHS[i % WIDTHS.length] })),
  );
  const counterRef = useRef(6);

  useEffect(() => {
    const interval = setInterval(() => {
      const id = counterRef.current++;
      const w = WIDTHS[id % WIDTHS.length];
      setRows((prev) => [{ id, w }, ...prev].slice(0, 28));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div
          key={row.id}
          className="flex items-center gap-2 py-0.5 transition-opacity duration-500"
          style={{ opacity: Math.max(0.08, 1 - i * 0.06) }}
        >
          <span className="animate-pulse text-emerald-500/70">+</span>
          <div className="h-2.5 animate-pulse rounded bg-zinc-700/60" style={{ width: `${row.w}%` }} />
        </div>
      ))}
    </div>
  );
}

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

  const rate = elapsed > 0 ? (pagesFound / elapsed).toFixed(2) : '\u2014';

  return (
    <div className="animate-fade-in grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
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
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-800/60 pt-4 lg:grid-cols-1 lg:gap-4">
            <div>
              <dt className="text-xs text-zinc-500">Pages found</dt>
              <dd className="font-mono text-2xl font-bold text-zinc-100">{pagesFound}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Elapsed</dt>
              <dd className="font-mono text-2xl font-bold text-zinc-100">
                {mins}m {secs.toString().padStart(2, '0')}s
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Pages/sec</dt>
              <dd className="font-mono text-2xl font-bold text-zinc-100">{rate}</dd>
            </div>
          </dl>
        </div>

        {status === 'error' && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
            Connection lost. Polling for updates...
          </div>
        )}
      </div>

      <div className="card-dark min-w-0 overflow-hidden rounded-xl">
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
        <div className="max-h-[calc(100vh-220px)] min-h-[480px] overflow-y-auto p-4 font-mono text-xs">
          {latestUrls.length === 0 && status === 'running' && <SkeletonFeed />}
          {latestUrls.length === 0 && status === 'connecting' && <p className="text-zinc-600">Waiting for pages...</p>}
          {latestUrls.map((url) => (
            <div key={url} className="animate-slide-up flex gap-2 py-0.5">
              <span className="text-emerald-500">+</span>
              <span className="truncate text-zinc-400">{url.replace(/^https?:\/\//, '')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
