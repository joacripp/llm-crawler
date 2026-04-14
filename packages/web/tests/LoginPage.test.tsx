import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
let mockSearch = '';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: mockSearch, pathname: '/login', hash: '', state: null, key: 'k' }),
  };
});

vi.mock('../src/api.js', () => ({
  api: { signup: vi.fn(), login: vi.fn(), me: vi.fn() },
  SignupRequiredError: class extends Error {},
}));

const setUser = vi.fn();
vi.mock('../src/context/AuthContext.js', () => ({
  useAuth: () => ({ user: null, loading: false, setUser }),
}));

const { api } = await import('../src/api.js');
const LoginPage = (await import('../src/pages/LoginPage.js')).default;

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = '';
  });

  it('defaults to login mode', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('starts in signup mode when ?mode=signup', () => {
    mockSearch = '?mode=signup';
    renderPage();
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
  });

  it('toggles between login and signup', async () => {
    renderPage();
    const user = userEvent.setup();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
  });

  it('logs in and navigates to /dashboard on success', async () => {
    (api.login as any).mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith('a@b.com', 'password123'));
    expect(setUser).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com' });
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('signs up and navigates to /dashboard on success', async () => {
    mockSearch = '?mode=signup';
    (api.signup as any).mockResolvedValue({ id: 'u2', email: 'new@x.com' });

    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Email'), 'new@x.com');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(api.signup).toHaveBeenCalledWith('new@x.com', 'password123'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('displays an error message on failure', async () => {
    (api.login as any).mockRejectedValue(new Error('Invalid credentials'));

    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Email'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
