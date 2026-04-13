import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../src/api.js', () => ({
  api: { listJobs: vi.fn(), me: vi.fn() },
  SignupRequiredError: class extends Error {},
}));

let mockUser: any = null;
let mockAuthLoading = false;
vi.mock('../src/context/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser, loading: mockAuthLoading, setUser: vi.fn() }),
}));

const { api } = await import('../src/api.js');
const DashboardPage = (await import('../src/pages/DashboardPage.js')).default;

function renderDashboard() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockAuthLoading = false;
  });

  it('shows loading state while auth is loading', () => {
    mockAuthLoading = true;
    renderDashboard();
    expect(screen.getByText(/loading\.\.\./i)).toBeInTheDocument();
    expect(api.listJobs).not.toHaveBeenCalled();
  });

  it('redirects to /login when auth is ready and there is no user', async () => {
    mockUser = null;
    renderDashboard();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(api.listJobs).not.toHaveBeenCalled();
  });

  it('lists jobs when authenticated', async () => {
    mockUser = { id: 'u1', email: 'a@b.com' };
    (api.listJobs as any).mockResolvedValue([
      { id: 'job-1', rootUrl: 'https://alpha.example', status: 'completed', createdAt: new Date().toISOString() },
      { id: 'job-2', rootUrl: 'https://beta.example',  status: 'running',   createdAt: new Date().toISOString() },
    ]);

    renderDashboard();
    await waitFor(() => expect(api.listJobs).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText('https://alpha.example')).toBeInTheDocument();
      expect(screen.getByText('https://beta.example')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('running')).toBeInTheDocument();
    });
  });

  it('shows empty state when authenticated user has no jobs', async () => {
    mockUser = { id: 'u1', email: 'a@b.com' };
    (api.listJobs as any).mockResolvedValue([]);

    renderDashboard();
    await waitFor(() => expect(screen.getByText(/no crawls yet/i)).toBeInTheDocument());
  });
});
