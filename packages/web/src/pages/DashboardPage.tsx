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
      <div className="animate-fade-in">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-xl font-bold text-zinc-100">Your Crawls</h2>
          <Link to="/" className="btn-primary">
            + New llms.txt
          </Link>
        </div>
        {(authLoading || loading) && (
          <div className="py-16 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-400" />
          </div>
        )}
        {!authLoading && !loading && jobs.length === 0 && (
          <div className="card-dark rounded-xl px-8 py-16 text-center">
            <p className="text-lg font-medium text-zinc-400">No crawls yet.</p>
            <p className="mt-2 text-sm text-zinc-600">Generate your first llms.txt file to get started.</p>
            <Link to="/" className="btn-primary mt-6 inline-flex">
              Get started
            </Link>
          </div>
        )}
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} {...job} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
