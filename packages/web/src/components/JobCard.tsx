import { Link } from 'react-router-dom';

interface JobCardProps {
  id: string;
  rootUrl: string;
  status: string;
  createdAt: string;
}

export default function JobCard({ id, rootUrl, status, createdAt }: JobCardProps) {
  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <Link
      to={`/jobs/${id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="truncate max-w-md text-sm font-medium text-slate-900">{rootUrl}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[status] ?? 'bg-slate-100 text-slate-700'}`}
        >
          {status}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{new Date(createdAt).toLocaleDateString()}</p>
    </Link>
  );
}
