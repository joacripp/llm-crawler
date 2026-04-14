import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.js';
import Layout from '../components/Layout.js';
import JobCard from '../components/JobCard.js';

interface Job {
  id: string;
  rootUrl: string;
  status: string;
  createdAt: string;
}

const POLL_INTERVAL = 10000;

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const fetchJobs = useCallback(async (isInitial = false) => {
    try {
      const data = await api.listJobs();
      setJobs(data);
      if (isInitial) setLoading(false);

      const newChanged = new Set<string>();
      for (const job of data) {
        const prev = prevStatusRef.current.get(job.id);
        if (prev && prev !== job.status) {
          newChanged.add(job.id);
        }
        prevStatusRef.current.set(job.id, job.status);
      }

      if (newChanged.size > 0) {
        setChangedIds(newChanged);
        setTimeout(() => setChangedIds(new Set()), 3000);
      }
    } catch {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJobs(true);
  }, [user, authLoading, fetchJobs, navigate]);

  // Poll only when there are active jobs.

  useEffect(() => {
    if (authLoading || !user) return;
    const hasActiveJobs = jobs.some((j) => j.status === 'running' || j.status === 'pending');
    if (!hasActiveJobs) return;

    const interval = setInterval(fetchJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [authLoading, user, jobs, fetchJobs]);

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
            <JobCard key={job.id} {...job} highlight={changedIds.has(job.id)} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
