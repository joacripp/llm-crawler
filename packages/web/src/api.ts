class SignupRequiredError extends Error {
  constructor() {
    super('signup_required');
    this.name = 'SignupRequiredError';
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // Auto-refresh on 401 (expired access token)
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.reason === 'signup_required') throw new SignupRequiredError();

    // Try refreshing the token (deduplicate concurrent refresh calls)
    if (!refreshing) refreshing = tryRefresh();
    const refreshed = await refreshing;
    refreshing = null;

    if (refreshed) {
      // Retry the original request with the new token
      const retry = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (retry.ok) return retry.json();
    }

    throw new Error(body.message ?? 'Session expired. Please log in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.reason === 'signup_required') throw new SignupRequiredError();
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  me: () => request<{ id: string; email: string }>('/api/auth/me'),
  createJob: (data: { url: string; maxDepth?: number; maxPages?: number }) =>
    request<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getJob: (id: string) =>
    request<{ id: string; status: string; pagesFound: number; rootUrl: string; createdAt: string; s3Key?: string }>(
      `/api/jobs/${id}`,
    ),
  getResult: (id: string) => request<{ downloadUrl?: string; error?: string }>(`/api/jobs/${id}/result`),
  getContent: async (id: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/api/jobs/${id}/content`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.text();
  },
  listJobs: () => request<Array<{ id: string; rootUrl: string; status: string; createdAt: string }>>('/api/jobs'),
  signup: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
};

export { SignupRequiredError };
