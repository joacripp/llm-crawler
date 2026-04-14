import { Link } from 'react-router-dom';

interface JobCardProps {
  id: string;
  rootUrl: string;
  status: string;
  createdAt: string;
}

const statusConfig: Record<string, { dot: string; text: string }> = {
  pending: { dot: 'bg-yellow-400', text: 'text-yellow-400' },
  running: { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400' },
  completed: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  failed: { dot: 'bg-red-400', text: 'text-red-400' },
};

export default function JobCard({ id, rootUrl, status, createdAt }: JobCardProps) {
  const cfg = statusConfig[status] ?? { dot: 'bg-zinc-500', text: 'text-zinc-500' };
  const hostname = (() => {
    try {
      return new URL(rootUrl).hostname;
    } catch {
      return rootUrl;
    }
  })();

  return (
    <Link
      to={`/jobs/${id}`}
      className="card-dark group block rounded-xl p-5 transition-all hover:border-zinc-700 hover:bg-zinc-800/50"
    >
      <div className="flex items-center gap-4">
        <img
          src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
          alt=""
          className="h-8 w-8 rounded-md bg-zinc-800 p-1"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-zinc-100">{rootUrl}</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {new Date(createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-medium ${cfg.text}`}>{status}</span>
        </div>
      </div>
    </Link>
  );
}
