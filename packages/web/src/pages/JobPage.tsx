import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useJobStream } from '../hooks/useJobStream.js';
import Layout from '../components/Layout.js';
import ProgressView from '../components/ProgressView.js';
import ResultView from '../components/ResultView.js';

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [initialStatus, setInitialStatus] = useState<string | null>(null);
  const [initialPagesFound, setInitialPagesFound] = useState(0);
  const [rootUrl, setRootUrl] = useState<string>();

  const shouldStream = initialStatus === 'running' || initialStatus === 'pending';
  const stream = useJobStream(shouldStream ? id! : null);

  useEffect(() => {
    if (!id) return;
    api.getJob(id).then((job) => {
      setInitialStatus(job.status);
      setInitialPagesFound(job.pagesFound);
      setRootUrl(job.rootUrl);
    });
  }, [id]);

  // Also poll while streaming to detect completion if SSE doesn't connect
  useEffect(() => {
    if (!id || !shouldStream) return;
    const interval = setInterval(() => {
      api.getJob(id).then((job) => {
        if (job.status === 'completed') {
          setInitialStatus('completed');
          setInitialPagesFound(job.pagesFound);
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [id, shouldStream]);

  const isComplete = initialStatus === 'completed' || stream.status === 'completed';
  const pagesFound = stream.pagesFound || initialPagesFound;

  return (
    <Layout>
      <div className="mx-auto max-w-xl">
        {!isComplete && (
          <ProgressView
            pagesFound={pagesFound}
            status={stream.status}
            rootUrl={rootUrl}
            latestUrls={stream.latestUrls}
            startedAt={stream.startedAt}
          />
        )}
        {isComplete && id && (
          <ResultView
            jobId={id}
            pagesFound={pagesFound}
            rootUrl={rootUrl}
          />
        )}
        {initialStatus === 'failed' && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-center">
            <p className="text-sm text-red-600">This crawl job failed. Please try again.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
