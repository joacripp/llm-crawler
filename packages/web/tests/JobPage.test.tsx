import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/api.js', () => ({
  api: { getJob: vi.fn(), getContent: vi.fn(), getResult: vi.fn() },
  SignupRequiredError: class extends Error {},
}));

vi.mock('../src/hooks/useJobStream.js', () => ({
  useJobStream: () => ({ pagesFound: 0, status: 'connecting', latestUrls: [], startedAt: null }),
}));

const { api } = await import('../src/api.js');
const JobPage = (await import('../src/pages/JobPage.js')).default;

function renderJob(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/jobs/${id}`]}>
      <Routes>
        <Route path="/jobs/:id" element={<JobPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('JobPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows loading initially', () => {
    (api.getJob as any).mockReturnValue(new Promise(() => {}));
    renderJob('job-1');
    expect(screen.getByText(/loading job/i)).toBeInTheDocument();
  });

  it('renders progress view for a running job', async () => {
    (api.getJob as any).mockResolvedValue({
      id: 'job-1', status: 'running', pagesFound: 5, rootUrl: 'https://example.com',
      createdAt: new Date().toISOString(),
    });

    renderJob('job-1');
    await waitFor(() => expect(screen.queryByText(/loading job/i)).not.toBeInTheDocument());
    // ProgressView shows the root URL.
    expect(screen.getByText(/example\.com/i)).toBeInTheDocument();
  });

  it('renders failed message for a failed job', async () => {
    (api.getJob as any).mockResolvedValue({
      id: 'job-1', status: 'failed', pagesFound: 0, rootUrl: 'https://example.com',
      createdAt: new Date().toISOString(),
    });

    renderJob('job-1');
    await waitFor(() => expect(screen.getByText(/this crawl job failed/i)).toBeInTheDocument());
  });

  it('renders result view for a completed job', async () => {
    (api.getJob as any).mockResolvedValue({
      id: 'job-1', status: 'completed', pagesFound: 42, rootUrl: 'https://example.com',
      createdAt: new Date().toISOString(),
    });
    (api.getContent as any).mockResolvedValue('# Example\n');

    renderJob('job-1');
    await waitFor(() => expect(screen.queryByText(/loading job/i)).not.toBeInTheDocument());
    // ResultView shows pages found count.
    await waitFor(() => expect(screen.getByText(/42/)).toBeInTheDocument());
  });
});
