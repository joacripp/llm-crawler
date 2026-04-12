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
      api.getContent(jobId).then((content) => {
        if (cancelled) return;
        if (content) {
          setLlmsTxt(content);
          setStatus('ready');
        } else if (retriesRef.current < 12) {
          // Not ready yet — retry in 5s (up to 60s)
          retriesRef.current++;
          timeout = setTimeout(tryFetch, 5000);
        } else {
          setStatus('error');
          setError('Result is taking longer than expected. Please refresh in a moment.');
        }
      }).catch((err) => {
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
    return () => { cancelled = true; clearTimeout(timeout); };
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

  return (
    <div className="space-y-4">
      {rootUrl && (
        <div className="rounded-lg bg-green-50 px-4 py-3 border border-green-100">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">
            {status === 'generating' ? 'Finishing up' : 'Completed'}
          </p>
          <p className="mt-0.5 text-sm font-medium text-green-800 truncate">{rootUrl}</p>
        </div>
      )}

      {status === 'generating' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-[2px] border-green-200 border-t-green-600" />
          <p className="text-sm font-medium text-slate-700">Generating your llms.txt...</p>
          <p className="text-xs text-slate-400">This usually takes a few seconds</p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-green-600">{pagesFound} sub-pages</span> crawled
            </p>
            <div className="flex gap-2">
              <button onClick={handleCopy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleDownload}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Download
              </button>
            </div>
          </div>

          {llmsTxt && (
            <textarea
              readOnly
              value={llmsTxt}
              className="w-full h-80 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 resize-y focus:outline-none focus:border-indigo-300"
              spellCheck={false}
            />
          )}
        </>
      )}

      {status === 'error' && error && (
        <p className="text-sm text-red-500 text-center py-4">{error}</p>
      )}
    </div>
  );
}
