import { useState } from 'react';

interface ResultViewProps {
  pagesFound: number;
  downloadUrl?: string;
}

export default function ResultView({ pagesFound, downloadUrl }: ResultViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!downloadUrl) return;
    try {
      const res = await fetch(downloadUrl);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-green-600">{pagesFound} pages</span> crawled
        </p>
        <div className="flex gap-2">
          <button onClick={handleCopy}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {downloadUrl && (
            <a href={downloadUrl} download="llms.txt"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
