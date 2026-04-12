class SignupRequiredError extends Error {
  constructor() { super('signup_required'); this.name = 'SignupRequiredError'; }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.reason === 'signup_required') throw new SignupRequiredError();
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  createJob: (data: { url: string; maxDepth?: number; maxPages?: number }) =>
    request<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getJob: (id: string) =>
    request<{ id: string; status: string; pagesFound: number; rootUrl: string; createdAt: string; s3Key?: string }>(`/api/jobs/${id}`),
  getResult: (id: string) =>
    request<{ downloadUrl?: string; error?: string }>(`/api/jobs/${id}/result`),
  getContent: async (id: string): Promise<string | null> => {
    const res = await fetch(`/api/jobs/${id}/content`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.text();
  },
  listJobs: () =>
    request<Array<{ id: string; rootUrl: string; status: string; createdAt: string }>>('/api/jobs'),
  signup: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
};

export { SignupRequiredError };
