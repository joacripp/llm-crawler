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
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const stream = useJobStream(initialStatus === 'running' || initialStatus === 'pending' ? id! : null);

  useEffect(() => {
    if (!id) return;
    api.getJob(id).then((job) => {
      setInitialStatus(job.status);
      if (job.status === 'completed') api.getResult(id).then((r) => { if (r.downloadUrl) setDownloadUrl(r.downloadUrl); });
    });
  }, [id]);

  const isComplete = initialStatus === 'completed' || stream.status === 'completed';
  const pagesFound = stream.pagesFound || 0;
  const finalDownloadUrl = stream.downloadUrl ?? downloadUrl;

  return (
    <Layout>
      <div className="mx-auto max-w-xl">
        <h2 className="mb-6 text-xl font-bold text-slate-900">Crawl Job</h2>
        {!isComplete && <ProgressView pagesFound={pagesFound} status={stream.status} />}
        {isComplete && <ResultView pagesFound={pagesFound} downloadUrl={finalDownloadUrl} />}
        {initialStatus === 'failed' && <p className="mt-4 text-center text-sm text-red-600">This crawl job failed. Please try again.</p>}
      </div>
    </Layout>
  );
}
