/**
 * Scenario 5: Burst Test
 *
 * 50 jobs submitted in 10 seconds. Tests:
 * - SQS queue depth spike handling
 * - Lambda cold start behavior under burst
 * - DLQ spillover
 * - Job completion rate after burst
 *
 * Phase 1: Burst — 50 VUs create jobs simultaneously
 * Phase 2: Drain — wait for all jobs to complete, measure completion rate
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { BASE_URL, freshJar, signup, pollUntilDone } from './helpers.js';

const burstLatency = new Trend('burst_create_latency', true);
const completionLatency = new Trend('burst_completion_latency', true);
const completedJobs = new Counter('burst_completed');
const failedJobs = new Counter('burst_failed');
const timeoutJobs = new Counter('burst_timeout');
const errorRate = new Rate('burst_error_rate');

const BURST_SIZE = parseInt(__ENV.BURST_SIZE || '50');
const BURST_WINDOW = parseInt(__ENV.BURST_WINDOW || '10'); // seconds

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: BURST_SIZE,
      iterations: BURST_SIZE,
      maxDuration: '10m',
    },
  },
  thresholds: {
    burst_create_latency: ['p(95)<10000'],
    burst_error_rate: ['rate<0.2'],
  },
};

export default function () {
  const jar = freshJar();
  signup(jar);

  // Small random delay within the burst window to avoid exact simultaneous hits
  sleep(Math.random() * BURST_WINDOW);

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ url: 'https://configcat.com', maxDepth: 1, maxPages: 3 }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );
  burstLatency.add(Date.now() - start);

  const ok = check(res, { 'create 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (!ok) {
    errorRate.add(true);
    console.error(`Job creation failed: ${res.status} ${res.body}`);
    return;
  }
  errorRate.add(false);

  const jobId = JSON.parse(res.body).id;

  // Wait for completion
  const result = pollUntilDone(jar, jobId, 480000); // 8 min
  completionLatency.add(Date.now() - start);

  if (result.status === 'completed') {
    completedJobs.add(1);
  } else if (result.status === 'failed') {
    failedJobs.add(1);
  } else {
    timeoutJobs.add(1);
  }
}
