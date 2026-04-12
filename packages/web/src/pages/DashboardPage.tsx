import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.js';
import JobCard from '../components/JobCard.js';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Array<{ id: string; rootUrl: string; status: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listJobs().then(setJobs).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <Layout>
      <h2 className="mb-6 text-xl font-bold text-slate-900">Your Crawls</h2>
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && jobs.length === 0 && <p className="text-sm text-slate-500">No crawls yet.</p>}
      <div className="space-y-3">{jobs.map((job) => <JobCard key={job.id} {...job} />)}</div>
    </Layout>
  );
}
