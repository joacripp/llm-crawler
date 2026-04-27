import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

interface ResultViewProps {
  jobId: string;
  pagesFound: number;
  rootUrl?: string;
}

export default function ResultView({ jobId, pagesFound, rootUrl }: ResultViewProps) {
  const [copied, setCopied] = useState(false);
  const [llmsTxt, setLlmsTxt] = useState<string>();
  const [status, setStatus] = useState<'generating' | 'ready' | 'error'>('generating');
  const [error, setError] = useState<string>();
  const retriesRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tryFetch = () => {
      api
        .getContent(jobId)
        .then((content) => {
          if (cancelled) return;
          if (content) {
            setLlmsTxt(content);
            setStatus('ready');
          } else if (retriesRef.current < 12) {
            retriesRef.current++;
            timeout = setTimeout(tryFetch, 5000);
          } else {
            setStatus('error');
            setError('Result is taking longer than expected. Please refresh in a moment.');
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (retriesRef.current < 12) {
            retriesRef.current++;
            timeout = setTimeout(tryFetch, 5000);
          } else {
            console.error('Failed to load content:', err);
            setStatus('error');
            setError('Failed to load result');
          }
        });
    };

    tryFetch();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [jobId]);

  const handleCopy = async () => {
    if (!llmsTxt) return;
    try {
      await navigator.clipboard.writeText(llmsTxt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    if (!llmsTxt) return;
    const blob = new Blob([llmsTxt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'llms.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const lineCount = llmsTxt ? llmsTxt.split('\n').length : 0;
  const sectionCount = llmsTxt ? (llmsTxt.match(/^##\s/gm) || []).length : 0;

  const summaryCard = rootUrl && (
    <div className="card-dark rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
          <svg
            className="h-4 w-4 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Completed</p>
          <p className="truncate text-sm font-medium text-zinc-200">{rootUrl}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-800/60 pt-4 lg:grid-cols-1 lg:gap-4">
        <div>
          <dt className="text-xs text-zinc-500">Pages</dt>
          <dd className="font-mono text-2xl font-bold text-zinc-100">{pagesFound}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Sections</dt>
          <dd className="font-mono text-2xl font-bold text-zinc-100">{sectionCount || '—'}</dd>
        </div>
      </dl>
      {status === 'ready' && (
        <div className="mt-5 flex gap-2 lg:flex-col">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:text-zinc-100"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={handleDownload} className="btn-primary flex-1 !text-xs">
            Download
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-fade-in grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">{summaryCard}</div>

      <div className="min-w-0">
        {status === 'generating' && (
          <div className="card-dark flex flex-col items-center gap-3 rounded-xl py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-400" />
            <p className="text-sm font-medium text-zinc-300">Generating your llms.txt...</p>
            <p className="text-xs text-zinc-600">This usually takes a few seconds</p>
          </div>
        )}

        {status === 'ready' && llmsTxt && (
          <div className="card-dark overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2.5">
              <span className="font-mono text-xs text-zinc-500">llms.txt</span>
              <span className="font-mono text-[10px] text-zinc-600">{lineCount} lines</span>
            </div>
            <pre className="max-h-[calc(100vh-220px)] min-h-[480px] overflow-auto whitespace-pre p-4 font-mono text-xs leading-relaxed text-zinc-300">
              {llmsTxt}
            </pre>
          </div>
        )}

        {status === 'error' && error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
