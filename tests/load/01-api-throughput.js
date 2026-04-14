/**
 * Scenario 1: API Throughput
 *
 * Tests how many concurrent users can create jobs and poll status
 * before API latency degrades. Measures:
 * - Job creation p50/p90/p99 latency
 * - Polling p50/p90/p99 latency
 * - Error rate under load
 *
 * Ramp: 1 → 20 concurrent users over 2 minutes, sustain for 3 min, ramp down.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, freshJar, signup, createJob } from './helpers.js';

const createLatency = new Trend('job_create_latency', true);
const pollLatency = new Trend('job_poll_latency', true);
const errorRate = new Rate('error_rate');
const jobsCreated = new Counter('jobs_created');

export const options = {
  scenarios: {
    throughput: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '2m', target: 20 },
        { duration: '3m', target: 20 }, // sustain
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    job_create_latency: ['p(95)<5000'],
    job_poll_latency: ['p(95)<2000'],
    error_rate: ['rate<0.05'],
  },
};

export default function () {
  const jar = freshJar();
  signup(jar);

  // Create a job
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ url: 'https://configcat.com', maxDepth: 1, maxPages: 3 }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );
  createLatency.add(Date.now() - start);

  const ok = check(res, { 'create 2xx': (r) => r.status >= 200 && r.status < 300 });
  errorRate.add(!ok);
  if (!ok) return;

  jobsCreated.add(1);
  const jobId = JSON.parse(res.body).id;

  // Poll 5 times
  for (let i = 0; i < 5; i++) {
    sleep(3);
    const pollStart = Date.now();
    const pollRes = http.get(`${BASE_URL}/api/jobs/${jobId}`, { jar });
    pollLatency.add(Date.now() - pollStart);
    check(pollRes, { 'poll 200': (r) => r.status === 200 });
  }
}
