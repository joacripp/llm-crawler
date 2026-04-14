/**
 * Scenario 4: Large Crawl Stress Test
 *
 * Single job with maxPages=5000. Tests:
 * - Crawler Lambda memory usage (3008 MB limit)
 * - Consumer batch processing under sustained event load
 * - Generator handling large page sets
 * - Resurrection flow if Lambda times out at 15 min
 * - Total wall-clock time to completion
 *
 * Run with: k6 run tests/load/04-large-crawl.js
 * Monitor: CloudWatch llm-crawler-dev-pipeline dashboard
 *
 * WARNING: This creates a real large crawl against configcat.com.
 * It may take 10-30 min to complete.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, freshJar, signup } from './helpers.js';

const e2eLatency = new Trend('large_crawl_e2e', true);
const pagesFound = new Counter('pages_found');

const LARGE_CRAWL_URL = __ENV.LARGE_CRAWL_URL || 'https://configcat.com';
const LARGE_MAX_PAGES = parseInt(__ENV.LARGE_MAX_PAGES || '5000');
const LARGE_MAX_DEPTH = parseInt(__ENV.LARGE_MAX_DEPTH || '10');
const POLL_TIMEOUT = parseInt(__ENV.POLL_TIMEOUT || '1800000'); // 30 min

export const options = {
  scenarios: {
    large_crawl: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '35m',
    },
  },
};

export default function () {
  const jar = freshJar();
  signup(jar);

  console.log(`Starting large crawl: ${LARGE_CRAWL_URL} (maxPages=${LARGE_MAX_PAGES}, maxDepth=${LARGE_MAX_DEPTH})`);
  console.log(
    'Monitor: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/llm-crawler-dev-pipeline',
  );

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ url: LARGE_CRAWL_URL, maxDepth: LARGE_MAX_DEPTH, maxPages: LARGE_MAX_PAGES }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );

  check(res, { 'create 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (res.status < 200 || res.status >= 300) {
    console.error(`Failed to create job: ${res.status} ${res.body}`);
    return;
  }

  const jobId = JSON.parse(res.body).id;
  console.log(`Job created: ${jobId}`);

  // Poll until done
  const deadline = Date.now() + POLL_TIMEOUT;
  let lastPages = 0;
  let lastLog = 0;

  while (Date.now() < deadline) {
    sleep(10);
    const pollRes = http.get(`${BASE_URL}/api/jobs/${jobId}`, { jar });
    if (pollRes.status !== 200) continue;

    const body = JSON.parse(pollRes.body);
    const currentPages = body.pagesFound || 0;

    // Log progress every 30s
    if (Date.now() - lastLog > 30000) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      const rate = currentPages > 0 ? (currentPages / elapsed).toFixed(1) : '0';
      console.log(`[${elapsed}s] status=${body.status} pages=${currentPages} (${rate} pages/s)`);
      lastLog = Date.now();
    }

    if (body.status === 'completed') {
      const elapsed = Date.now() - start;
      e2eLatency.add(elapsed);
      pagesFound.add(currentPages);
      console.log(`Completed: ${currentPages} pages in ${Math.round(elapsed / 1000)}s`);
      return;
    }
    if (body.status === 'failed') {
      console.error(`Job failed after ${Math.round((Date.now() - start) / 1000)}s with ${currentPages} pages`);
      return;
    }

    lastPages = currentPages;
  }

  console.error(`Job timed out after ${POLL_TIMEOUT / 1000}s`);
}
