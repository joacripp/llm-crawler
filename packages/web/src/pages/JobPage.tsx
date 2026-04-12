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
  const [rootUrl, setRootUrl] = useState<string>();
  const stream = useJobStream(initialStatus === 'running' || initialStatus === 'pending' ? id! : null);

  useEffect(() => {
    if (!id) return;
    api.getJob(id).then((job) => {
      setInitialStatus(job.status);
      setRootUrl(job.rootUrl);
    });
  }, [id]);

  const isComplete = initialStatus === 'completed' || stream.status === 'completed';
  const pagesFound = stream.pagesFound || 0;

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
