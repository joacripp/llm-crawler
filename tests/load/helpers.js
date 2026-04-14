import http from 'k6/http';
import { check, sleep } from 'k6';

export const BASE_URL = __ENV.API_BASE || 'https://api.llmtxtgenerator.online';
export const SITE_URL = __ENV.SITE_URL || 'https://llmtxtgenerator.online';

// Small, fast, server-rendered site for load tests. Won't DDoS anyone.
export const TEST_URL = __ENV.TEST_URL || 'https://configcat.com';
export const TEST_MAX_DEPTH = parseInt(__ENV.TEST_MAX_DEPTH || '1');
export const TEST_MAX_PAGES = parseInt(__ENV.TEST_MAX_PAGES || '3');

// Create a job and return the job ID. Uses a fresh session (anon).
export function createJob(jar, url, maxDepth, maxPages) {
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({
      url: url || TEST_URL,
      maxDepth: maxDepth || TEST_MAX_DEPTH,
      maxPages: maxPages || TEST_MAX_PAGES,
    }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );
  check(res, { 'job created (200 or 201)': (r) => r.status >= 200 && r.status < 300 });
  if (res.status >= 200 && res.status < 300) {
    const body = JSON.parse(res.body);
    return body.id;
  }
  return null;
}

// Poll a job until terminal state or timeout. Returns final status.
export function pollUntilDone(jar, jobId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 300000);
  while (Date.now() < deadline) {
    const res = http.get(`${BASE_URL}/api/jobs/${jobId}`, { jar });
    if (res.status === 200) {
      const body = JSON.parse(res.body);
      if (body.status === 'completed' || body.status === 'failed') {
        return body;
      }
    }
    sleep(5);
  }
  return { status: 'timeout' };
}

// Signup with a unique email to get an authenticated session.
export function signup(jar) {
  const email = `loadtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = http.post(`${BASE_URL}/api/auth/signup`, JSON.stringify({ email, password: 'loadtest1234' }), {
    headers: { 'Content-Type': 'application/json' },
    jar,
  });
  check(res, { 'signup ok': (r) => r.status === 201 || r.status === 200 });
  return email;
}

// Fresh cookie jar (anonymous session).
export function freshJar() {
  return http.cookieJar();
}
