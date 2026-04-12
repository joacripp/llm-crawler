interface ProgressViewProps {
  pagesFound: number;
  status: 'connecting' | 'running' | 'completed' | 'error';
}

export default function ProgressView({ pagesFound, status }: ProgressViewProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {status === 'connecting' && <p className="text-sm text-slate-500">Connecting...</p>}
      {status === 'running' && (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
          <p className="text-lg font-semibold text-slate-900">Crawling...</p>
        </>
      )}
      {status === 'error' && <p className="text-sm text-red-600">Connection lost. Refresh to reconnect.</p>}
      <p className="text-2xl font-bold text-indigo-600">{pagesFound}</p>
      <p className="text-sm text-slate-500">pages found</p>
    </div>
  );
}
