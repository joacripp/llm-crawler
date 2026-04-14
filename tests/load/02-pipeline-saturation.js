/**
 * Scenario 2: Pipeline Saturation
 *
 * Submit N jobs simultaneously and measure time-to-completion.
 * Identifies the bottleneck: Lambda concurrency, RDS connections,
 * SQS throughput, or generator contention.
 *
 * Each VU creates a job, polls until completed, and reports total
 * wall-clock time. 10 concurrent jobs sustained for 5 min.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, freshJar, signup, pollUntilDone } from './helpers.js';

const e2eLatency = new Trend('e2e_job_latency', true);
const completedJobs = new Counter('completed_jobs');
const failedJobs = new Counter('failed_jobs');
const timeoutJobs = new Counter('timeout_jobs');
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: {
    saturation: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
    },
  },
  thresholds: {
    e2e_job_latency: ['p(90)<180000'], // 90th percentile under 3 min
    error_rate: ['rate<0.1'],
  },
};

export default function () {
  const jar = freshJar();
  signup(jar);

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ url: 'https://configcat.com', maxDepth: 1, maxPages: 3 }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );

  const ok = check(res, { 'create 2xx': (r) => r.status >= 200 && r.status < 300 });
  errorRate.add(!ok);
  if (!ok) return;

  const jobId = JSON.parse(res.body).id;
  const result = pollUntilDone(jar, jobId, 300000);

  e2eLatency.add(Date.now() - start);

  if (result.status === 'completed') {
    completedJobs.add(1);
  } else if (result.status === 'failed') {
    failedJobs.add(1);
    errorRate.add(true);
  } else {
    timeoutJobs.add(1);
    errorRate.add(true);
  }

  sleep(2); // Brief pause before next iteration
}
