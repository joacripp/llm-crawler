import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import type { Browser } from 'playwright';

export interface PageData {
  url: string;
  title: string;
  description: string;
  depth: number;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  concurrency?: number;
  onProgress?: (info: { url: string; pagesFound: number }) => void;
}

const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|tar|gz|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|wav)$/i;
const SKIP_PATHS = /^\/(api|admin|login|logout|signin|signup|auth|cdn-cgi|wp-json)\//i;

export async function crawl(rootUrl: string, options: CrawlOptions = {}): Promise<PageData[]> {
  const { maxDepth = 3, maxPages = 50, concurrency = 5, onProgress } = options;

  // --- Phase 1: probe root with plain HTTP to detect SPA ---
  const probeHtml = await fetchWithAxios(rootUrl);
  const useBrowser = probeHtml !== null && isSpa(probeHtml);

  let browser: Browser | null = null;
  if (useBrowser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
  }

  const origin = new URL(rootUrl).origin;
  const visited = new Set<string>();
  const results: PageData[] = [];
  const limit = pLimit(concurrency);

  // BFS level by level
  let currentLevel = [normalizeUrl(rootUrl)];
  visited.add(currentLevel[0]);

  try {
    for (let depth = 0; depth <= maxDepth && currentLevel.length > 0 && results.length < maxPages; depth++) {
      const nextLevel: string[] = [];

      await Promise.all(
        currentLevel.map((url) =>
          limit(async () => {
            if (results.length >= maxPages) return;

            try {
              const html = useBrowser && browser
                ? await fetchWithBrowser(browser, url)
                : await fetchWithAxios(url);

              if (!html) return;

              const $ = cheerio.load(html);

              const title =
                $('title').first().text().trim() ||
                $('h1').first().text().trim() ||
                url;

              const description =
                $('meta[name="description"]').attr('content')?.trim() ||
                $('meta[property="og:description"]').attr('content')?.trim() ||
                '';

              results.push({ url, title: cleanTitle(title), description, depth });
              onProgress?.({ url, pagesFound: results.length });

              if (depth < maxDepth) {
                $('a[href]').each((_, el) => {
                  const href = $(el).attr('href');
                  if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;

                  try {
                    const resolved = new URL(href, url);

                    if (resolved.origin !== origin) return;
                    if (resolved.search && !useBrowser) return; // skip query params for static sites
                    if (SKIP_EXTENSIONS.test(resolved.pathname)) return;
                    if (SKIP_PATHS.test(resolved.pathname)) return;

                    const normalized = normalizeUrl(resolved.toString());
                    if (!visited.has(normalized)) {
                      visited.add(normalized);
                      nextLevel.push(normalized);
                    }
                  } catch {
                    // ignore malformed URLs
                  }
                });
              }
            } catch {
              // skip unreachable pages silently
            }
          })
        )
      );

      currentLevel = nextLevel;
    }
  } finally {
    await browser?.close();
  }

  return results;
}

// ---------------------------------------------------------------------------
// HTTP fetch (static HTML)
// ---------------------------------------------------------------------------

async function fetchWithAxios(url: string): Promise<string | null> {
  try {
    const response = await axios.get<string>(url, {
      timeout: 10_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; llms-txt-crawler/1.0)',
        Accept: 'text/html',
      },
      maxRedirects: 5,
      validateStatus: (s) => s < 400,
    });
    const contentType = response.headers['content-type'] ?? '';
    if (!contentType.includes('text/html')) return null;
    return response.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Headless browser fetch (JavaScript-rendered sites / SPAs)
// ---------------------------------------------------------------------------

async function fetchWithBrowser(browser: Browser, url: string): Promise<string | null> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
    return await page.content();
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// SPA detection
// ---------------------------------------------------------------------------

function isSpa(html: string): boolean {
  const $ = cheerio.load(html);

  // Common SPA root containers
  const hasSpaRoot = $('#root, #app, #__next, #__nuxt, [data-reactroot]').length > 0;

  // Vite / bundler entry point
  const hasModuleScript = $('script[type="module"]').length > 0;

  // A non-SPA would have real navigation links in the static HTML
  const hasStaticNavLinks = $('a[href^="/"], a[href^="./"]').filter((_, el) => {
    const href = $(el).attr('href') ?? '';
    // Exclude asset links
    return !SKIP_EXTENSIONS.test(href);
  }).length > 0;

  return (hasSpaRoot || hasModuleScript) && !hasStaticNavLinks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}
