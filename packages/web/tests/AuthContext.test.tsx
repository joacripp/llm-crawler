import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../src/api.js', () => ({
  api: {
    me: vi.fn(),
  },
  SignupRequiredError: class extends Error {},
}));

const { api } = await import('../src/api.js');
const { AuthProvider, useAuth } = await import('../src/context/AuthContext.js');

function Probe() {
  const { user, loading, setUser } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="user">{user ? user.email : 'anon'}</span>
      <button onClick={() => setUser({ id: 'manual', email: 'manual@x.com' })}>set</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('starts in loading state then resolves to user when /me succeeds', async () => {
    (api.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('user').textContent).toBe('a@b.com');
  });

  it('resolves to anonymous (null user) when /me fails', async () => {
    (api.me as any).mockRejectedValue(new Error('401'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('user').textContent).toBe('anon');
  });

  it('exposes setUser to consumers', async () => {
    (api.me as any).mockRejectedValue(new Error('401'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    act(() => { screen.getByText('set').click(); });
    expect(screen.getByTestId('user').textContent).toBe('manual@x.com');
  });
});
