import { useState, useEffect } from 'react';
import { api } from '../api.js';

interface ResultViewProps {
  jobId: string;
  pagesFound: number;
  rootUrl?: string;
}

export default function ResultView({ jobId, pagesFound, rootUrl }: ResultViewProps) {
  const [copied, setCopied] = useState(false);
  const [llmsTxt, setLlmsTxt] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.getContent(jobId).then((content) => {
      if (content) {
        setLlmsTxt(content);
      } else {
        setError('Result not available yet');
      }
    }).catch((err) => {
      console.error('Failed to load content:', err);
      setError('Failed to load result');
    }).finally(() => setLoading(false));
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

  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-8">Loading result...</p>;
  }

  return (
    <div className="space-y-4">
      {rootUrl && (
        <div className="rounded-lg bg-green-50 px-4 py-3 border border-green-100">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Completed</p>
          <p className="mt-0.5 text-sm font-medium text-green-800 truncate">{rootUrl}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-green-600">{pagesFound} sub-pages</span> crawled
        </p>
        <div className="flex gap-2">
          <button onClick={handleCopy} disabled={!llmsTxt}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={handleDownload} disabled={!llmsTxt}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
            Download
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {llmsTxt && (
        <textarea
          readOnly
          value={llmsTxt}
          className="w-full h-80 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 resize-y focus:outline-none focus:border-indigo-300"
          spellCheck={false}
        />
      )}
    </div>
  );
}
