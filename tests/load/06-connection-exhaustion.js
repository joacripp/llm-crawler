/**
 * Scenario 6: Connection Exhaustion
 *
 * Sustained high-frequency API requests to push RDS connections
 * and Redis connections toward their limits. Measures:
 * - RDS DatabaseConnections (watch for hitting max_connections)
 * - Redis CurrConnections
 * - API error rate as connections exhaust
 * - Recovery time after load drops
 *
 * Ramp: 1 → 100 concurrent users doing rapid polling.
 * This is intentionally aggressive — it's a stress test.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, freshJar, signup } from './helpers.js';

const requestLatency = new Trend('req_latency', true);
const errorRate = new Rate('conn_error_rate');
const totalRequests = new Counter('total_requests');
const errors5xx = new Counter('errors_5xx');

export const options = {
  scenarios: {
    exhaustion: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 }, // sustain at peak
        { duration: '30s', target: 50 }, // ramp down (measure recovery)
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    req_latency: ['p(95)<5000'],
    conn_error_rate: ['rate<0.3'], // some errors expected at peak
  },
};

export default function () {
  const jar = freshJar();

  // Mix of endpoints to stress different DB paths:
  // - health/ready: DB + Redis ping
  // - auth/signup: user INSERT
  // - jobs list: job SELECT
  const endpoints = [
    { url: `${BASE_URL}/api/health/ready`, method: 'GET' },
    { url: `${BASE_URL}/api/health/ready`, method: 'GET' },
    { url: `${BASE_URL}/api/health`, method: 'GET' },
  ];

  // On first iteration, also do a signup to create a session
  signup(jar);

  // Rapid-fire requests
  for (let i = 0; i < 10; i++) {
    const ep = endpoints[i % endpoints.length];
    const start = Date.now();
    const res = http.get(ep.url, { jar });
    requestLatency.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, { 'status ok': (r) => r.status >= 200 && r.status < 500 });
    errorRate.add(!ok);
    if (res.status >= 500) {
      errors5xx.add(1);
    }

    sleep(0.5); // 2 req/s per VU → 200 req/s at 100 VUs
  }
}
