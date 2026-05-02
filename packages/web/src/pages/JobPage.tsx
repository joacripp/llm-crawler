import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.js';
import { useJobStream } from '../hooks/useJobStream.js';
import Layout from '../components/Layout.js';
import ProgressView from '../components/ProgressView.js';
import ResultView from '../components/ResultView.js';

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [initialStatus, setInitialStatus] = useState<string | null>(null);
  const [initialPagesFound, setInitialPagesFound] = useState(0);
  const [rootUrl, setRootUrl] = useState<string>();
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const shouldStream = initialStatus === 'running' || initialStatus === 'pending';
  const stream = useJobStream(shouldStream ? id! : null);

  useEffect(() => {
    if (!id) return;
    api
      .getJob(id)
      .then((job) => {
        setInitialStatus(job.status);
        setInitialPagesFound(job.pagesFound);
        setRootUrl(job.rootUrl);
        setCreatedAt(new Date(job.createdAt).getTime());
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isComplete = initialStatus === 'completed' || stream.status === 'completed';
  const isFailed = initialStatus === 'failed';
  const pagesFound = stream.pagesFound || initialPagesFound;

  if (loading) {
    return (
      <Layout>
        <div className="mx-auto max-w-xl py-16 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-400" />
          <p className="mt-3 text-sm text-zinc-500">Loading job...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`mx-auto ${isComplete || (!isFailed && shouldStream) ? 'max-w-7xl' : 'max-w-xl'}`}>
        {!isComplete && !isFailed && user?.email && (
          <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-center">
            <p className="text-sm text-blue-300">
              We&apos;ll email you at <strong className="text-blue-200">{user.email}</strong> when this crawl finishes.
            </p>
          </div>
        )}
        {!isComplete && !isFailed && (
          <ProgressView
            pagesFound={pagesFound}
            status={shouldStream ? stream.status : 'connecting'}
            rootUrl={rootUrl}
            latestUrls={stream.latestUrls}
            startedAt={createdAt}
          />
        )}
        {isComplete && id && <ResultView jobId={id} pagesFound={pagesFound} rootUrl={rootUrl} />}
        {isFailed && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center">
            <p className="text-sm text-red-400">This crawl job failed. Please try again.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
