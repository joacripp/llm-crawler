/**
 * Scenario 7: High-Fanout Page Stress Test
 *
 * Crawls a site known to have pages with 200+ outbound links.
 * Tests the consumer's ability to persist large newUrls arrays
 * without transaction timeouts.
 *
 * Uses camel.apache.org — their /components/next page has 200+
 * links. maxDepth=2 ensures we reach it; maxPages=20 keeps the
 * crawl short while still exercising the high-fanout path.
 *
 * This scenario was added after a production bug where sequential
 * discovered_url upserts inside a Prisma transaction timed out
 * on pages with 200+ links.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, freshJar, signup, pollUntilDone } from './helpers.js';

const e2eLatency = new Trend('high_fanout_e2e', true);
const pagesFound = new Counter('high_fanout_pages');

export const options = {
  scenarios: {
    high_fanout: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10m',
    },
  },
};

export default function () {
  const jar = freshJar();
  signup(jar);

  console.log('Starting high-fanout crawl: camel.apache.org (maxDepth=2, maxPages=20)');
  console.log('This exercises pages with 200+ outbound links per page.');
  console.log(
    'Monitor: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/llm-crawler-dev-pipeline',
  );

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({ url: 'https://camel.apache.org', maxDepth: 2, maxPages: 20 }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  );

  check(res, { 'create 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (res.status < 200 || res.status >= 300) {
    console.error(`Failed to create job: ${res.status} ${res.body}`);
    return;
  }

  const jobId = JSON.parse(res.body).id;
  console.log(`Job created: ${jobId}`);

  const result = pollUntilDone(jar, jobId, 480000); // 8 min timeout
  const elapsed = Date.now() - start;

  if (result.status === 'completed') {
    e2eLatency.add(elapsed);
    pagesFound.add(result.pagesFound || 0);
    console.log(`Completed: ${result.pagesFound} pages in ${Math.round(elapsed / 1000)}s`);
  } else {
    console.error(`Job ended with status=${result.status} after ${Math.round(elapsed / 1000)}s`);
  }
}
