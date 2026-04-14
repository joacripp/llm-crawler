import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.js';
import Layout from '../components/Layout.js';
import JobCard from '../components/JobCard.js';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Array<{ id: string; rootUrl: string; status: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    api
      .listJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Your Crawls</h2>
        <Link
          to="/"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + New llms.txt
        </Link>
      </div>
      {(authLoading || loading) && <p className="text-sm text-slate-500">Loading...</p>}
      {!authLoading && !loading && jobs.length === 0 && <p className="text-sm text-slate-500">No crawls yet.</p>}
      <div className="space-y-3">
        {jobs.map((job) => (
          <JobCard key={job.id} {...job} />
        ))}
      </div>
    </Layout>
  );
}
