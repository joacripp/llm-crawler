/**
 * Scenario 3: SSE Connection Stress
 *
 * Tests how many concurrent SSE streams the API can hold before
 * Redis Pub/Sub or ECS memory becomes an issue.
 *
 * Each VU creates a job, then opens a long-lived SSE connection
 * (simulated with repeated polling since k6 doesn't natively support
 * EventSource). Measures connection success rate and response times
 * under concurrent stream load.
 *
 * Ramp: 1 → 50 concurrent connections over 2 min, sustain 3 min.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, freshJar, signup } from './helpers.js';

const sseLatency = new Trend('sse_poll_latency', true);
const sseErrors = new Counter('sse_errors');
const errorRate = new Rate('error_rate');
const activeStreams = new Counter('active_streams');

export const options = {
  scenarios: {
    sse_stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 25 },
        { duration: '1m', target: 50 },
        { duration: '3m', target: 50 }, // sustain
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    sse_poll_latency: ['p(95)<3000'],
    error_rate: ['rate<0.1'],
  },
};

export default function () {
  const jar = freshJar();
  signup(jar);

  // Create a job to have a valid stream endpoint
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ url: 'https://configcat.com', maxDepth: 1, maxPages: 3 }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );

  if (res.status < 200 || res.status >= 300) {
    errorRate.add(true);
    return;
  }

  const jobId = JSON.parse(res.body).id;
  activeStreams.add(1);

  // Simulate SSE by rapid polling of the job status endpoint
  // (k6 doesn't support EventSource natively — this measures the
  // API's ability to handle concurrent reads under SSE-like load)
  for (let i = 0; i < 30; i++) {
    const start = Date.now();
    const pollRes = http.get(`${BASE_URL}/api/jobs/${jobId}`, { jar });
    sseLatency.add(Date.now() - start);

    const ok = check(pollRes, { 'poll ok': (r) => r.status === 200 });
    if (!ok) {
      sseErrors.add(1);
      errorRate.add(true);
    } else {
      errorRate.add(false);
    }

    sleep(2);
  }
}
