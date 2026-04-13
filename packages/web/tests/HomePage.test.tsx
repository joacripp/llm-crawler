import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

class SignupRequiredError extends Error {
  constructor() { super('signup_required'); this.name = 'SignupRequiredError'; }
}

vi.mock('../src/api.js', () => ({
  api: { createJob: vi.fn(), signup: vi.fn(), login: vi.fn(), me: vi.fn() },
  SignupRequiredError,
}));

const setUser = vi.fn();
vi.mock('../src/context/AuthContext.js', () => ({
  useAuth: () => ({ user: null, loading: false, setUser }),
}));

const { api } = await import('../src/api.js');
const HomePage = (await import('../src/pages/HomePage.js')).default;

function renderHome() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

describe('HomePage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('submits a crawl job and navigates to the job page on success', async () => {
    (api.createJob as any).mockResolvedValue({ id: 'job-99' });

    renderHome();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /generate llms\.txt/i }));

    await waitFor(() => expect(api.createJob).toHaveBeenCalledWith({
      url: 'https://example.com', maxDepth: 3, maxPages: 200,
    }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-99');
  });

  it('shows the auth modal when SignupRequiredError is thrown', async () => {
    (api.createJob as any).mockRejectedValue(new SignupRequiredError());

    renderHome();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /generate llms\.txt/i }));

    await waitFor(() => expect(screen.getByText('Create an account')).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays generic errors inline', async () => {
    (api.createJob as any).mockRejectedValue(new Error('Something went wrong'));

    renderHome();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /generate llms\.txt/i }));

    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('reveals advanced options when toggled', async () => {
    renderHome();
    const user = userEvent.setup();
    expect(screen.queryByText('Max depth')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /advanced options/i }));
    expect(screen.getByText('Max depth')).toBeInTheDocument();
    expect(screen.getByText('Max pages')).toBeInTheDocument();
  });

  it('passes custom maxDepth/maxPages from advanced options', async () => {
    (api.createJob as any).mockResolvedValue({ id: 'job-1' });
    renderHome();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /advanced options/i }));

    // Labels in this form aren't htmlFor-bound; locate by current value instead.
    const depthInput = screen.getByDisplayValue('3') as HTMLInputElement;
    const pagesInput = screen.getByDisplayValue('200') as HTMLInputElement;
    await user.clear(depthInput);
    await user.type(depthInput, '5');
    await user.clear(pagesInput);
    await user.type(pagesInput, '100');

    await user.click(screen.getByRole('button', { name: /generate llms\.txt/i }));

    await waitFor(() => expect(api.createJob).toHaveBeenCalledWith({
      url: 'https://example.com', maxDepth: 5, maxPages: 100,
    }));
  });
});
