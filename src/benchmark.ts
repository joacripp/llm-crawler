import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import type { PageData } from './crawler.js';

// 10 server-rendered sites picked from llmstxt.site
const SITES = [
  'https://mariadb.com',
];

const OPTS = { maxDepth: 10_000, maxPages: 10_000, concurrency: 5 };
const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|tar|gz|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|wav)$/i;
const SKIP_PATHS = /^\/(api|admin|login|logout|signin|signup|auth|cdn-cgi|wp-json)\//i;

// ─── Memory helper ──────────────────────────────────────────────────────────

function getMemMB(): number {
  return Math.round(process.memoryUsage.rss() / 1024 / 1024);
}

// ─── Cheerio crawler ────────────────────────────────────────────────────────

async function crawlCheerio(rootUrl: string): Promise<PageData[]> {
  const origin = new URL(rootUrl).origin;
  const visited = new Set<string>();
  const results: PageData[] = [];
  const limit = pLimit(OPTS.concurrency);
  let currentLevel = [normalizeUrl(rootUrl)];
  visited.add(currentLevel[0]);

  for (let depth = 0; depth <= OPTS.maxDepth && currentLevel.length > 0 && results.length < OPTS.maxPages; depth++) {
    const nextLevel: string[] = [];
    await Promise.all(currentLevel.map(url => limit(async () => {
      if (results.length >= OPTS.maxPages) return;
      try {
        const res = await axios.get<string>(url, {
          timeout: 10_000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; benchmark/1.0)', Accept: 'text/html' },
          maxRedirects: 5,
          validateStatus: s => s < 400,
        });
        if (!(res.headers['content-type'] ?? '').includes('text/html')) return;
        const $ = cheerio.load(res.data);
        const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;
        const description =
          $('meta[name="description"]').attr('content')?.trim() ||
          $('meta[property="og:description"]').attr('content')?.trim() || '';
        results.push({ url, title: title.replace(/\s+/g, ' ').trim(), description, depth });
        if (depth < OPTS.maxDepth) {
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
            try {
              const resolved = new URL(href, url);
              if (resolved.origin !== origin) return;
              if (resolved.search) return;
              if (SKIP_EXTENSIONS.test(resolved.pathname)) return;
              if (SKIP_PATHS.test(resolved.pathname)) return;
              const n = normalizeUrl(resolved.toString());
              if (!visited.has(n)) { visited.add(n); nextLevel.push(n); }
            } catch {}
          });
        }
      } catch {}
    })));
    currentLevel = nextLevel;
  }
  return results;
}

// ─── Playwright crawler ──────────────────────────────────────────────────────

async function crawlPlaywright(rootUrl: string, browser: Browser): Promise<PageData[]> {
  const origin = new URL(rootUrl).origin;
  const visited = new Set<string>();
  const results: PageData[] = [];
  const limit = pLimit(3);
  let currentLevel = [normalizeUrl(rootUrl)];
  visited.add(currentLevel[0]);

  for (let depth = 0; depth <= OPTS.maxDepth && currentLevel.length > 0 && results.length < OPTS.maxPages; depth++) {
    const nextLevel: string[] = [];
    await Promise.all(currentLevel.map(url => limit(async () => {
      if (results.length >= OPTS.maxPages) return;
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        const html = await page.content();
        const $ = cheerio.load(html);
        const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;
        const description =
          $('meta[name="description"]').attr('content')?.trim() ||
          $('meta[property="og:description"]').attr('content')?.trim() || '';
        results.push({ url, title: title.replace(/\s+/g, ' ').trim(), description, depth });
        if (depth < OPTS.maxDepth) {
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
            try {
              const resolved = new URL(href, url);
              if (resolved.origin !== origin) return;
              if (resolved.search) return;
              if (SKIP_EXTENSIONS.test(resolved.pathname)) return;
              if (SKIP_PATHS.test(resolved.pathname)) return;
              const n = normalizeUrl(resolved.toString());
              if (!visited.has(n)) { visited.add(n); nextLevel.push(n); }
            } catch {}
          });
        }
      } catch {} finally {
        await page.close();
      }
    })));
    currentLevel = nextLevel;
  }
  return results;
}

// ─── Benchmark runner ────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = ''; u.search = '';
  if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

interface BenchResult {
  site: string;
  cheerio: { ms: number; pages: number; memStart: number; memEnd: number };
  playwright: { ms: number; pages: number; memStart: number; memEnd: number };
}

const browser = await chromium.launch({ headless: true });
const results: BenchResult[] = [];

for (const site of SITES) {
  process.stdout.write(`\nBenchmarking ${site} ...\n`);

  // Playwright only — cheerio data already collected (10004 pages, 2214449ms)
  global.gc?.();
  const pm1 = getMemMB();
  const t2 = Date.now();
  const playwrightPages = await crawlPlaywright(site, browser);
  const playwrightMs = Date.now() - t2;
  const pm2 = getMemMB();

  console.log(`  playwright: ${playwrightPages.length} pages in ${playwrightMs}ms  (mem: ${pm1}→${pm2} MB, Δ${pm2 - pm1} MB)`);
}

await browser.close();

// ─── Print report ────────────────────────────────────────────────────────────

console.log('\n\n' + '═'.repeat(100));
console.log('BENCHMARK REPORT  (maxDepth=2, maxPages=unlimited)');
console.log('═'.repeat(100));

console.log(`\n${'Site'.padEnd(28)} ${'C pages'.padStart(7)} ${'C ms'.padStart(7)} ${'C mem Δ'.padStart(8)} ${'PW pages'.padStart(8)} ${'PW ms'.padStart(8)} ${'PW mem Δ'.padStart(9)} ${'Speed'.padStart(8)} ${'Pages'.padStart(7)}`);
console.log('─'.repeat(100));
for (const r of results) {
  const host = new URL(r.site).hostname.slice(0, 27);
  const speedWinner = r.cheerio.ms < r.playwright.ms ? 'C' : 'PW';
  const pagesEqual = r.cheerio.pages === r.playwright.pages ? '=' : r.cheerio.pages > r.playwright.pages ? 'C+' : 'PW+';
  console.log(
    `${host.padEnd(28)} ${String(r.cheerio.pages).padStart(7)} ${String(r.cheerio.ms).padStart(7)} ${(String(r.cheerio.memEnd - r.cheerio.memStart) + ' MB').padStart(8)} ${String(r.playwright.pages).padStart(8)} ${String(r.playwright.ms).padStart(8)} ${(String(r.playwright.memEnd - r.playwright.memStart) + ' MB').padStart(9)} ${speedWinner.padStart(8)} ${pagesEqual.padStart(7)}`
  );
}

const totalCMs = results.reduce((s, r) => s + r.cheerio.ms, 0);
const totalPMs = results.reduce((s, r) => s + r.playwright.ms, 0);
const totalCPages = results.reduce((s, r) => s + r.cheerio.pages, 0);
const totalPPages = results.reduce((s, r) => s + r.playwright.pages, 0);
const avgCMem = Math.round(results.reduce((s, r) => s + (r.cheerio.memEnd - r.cheerio.memStart), 0) / results.length);
const avgPMem = Math.round(results.reduce((s, r) => s + (r.playwright.memEnd - r.playwright.memStart), 0) / results.length);
console.log('─'.repeat(100));
console.log(`${'TOTALS'.padEnd(28)} ${String(totalCPages).padStart(7)} ${String(totalCMs).padStart(7)} ${(avgCMem + ' avg').padStart(8)} ${String(totalPPages).padStart(8)} ${String(totalPMs).padStart(8)} ${(avgPMem + ' avg').padStart(9)}`);
