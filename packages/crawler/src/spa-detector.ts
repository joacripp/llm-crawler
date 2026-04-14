// packages/crawler/src/spa-detector.ts
import * as cheerio from 'cheerio';
import { isSkippableExtension } from '@llm-crawler/shared';

/**
 * Detect whether an HTML page is a client-side SPA that needs Playwright.
 *
 * A true SPA (React CRA, Vite + React, Angular) ships an HTML shell with:
 *   - A mount point (#root, #app, etc.)
 *   - Almost no visible text content in the body
 *   - Zero or very few static <a> navigation links
 *
 * Server-rendered sites with hydration (Next.js, Nuxt, Astro, Vite SSR)
 * also have mount points and <script type="module">, but their HTML
 * contains real content + navigation links. These should use Cheerio.
 *
 * Previous heuristic used <script type="module"> as a signal, but every
 * modern framework (including SSR ones) uses ES modules. This caused
 * false positives on Vite SSR, Astro, SvelteKit, etc.
 */
export function isSpa(html: string): boolean {
  const $ = cheerio.load(html);

  // 1. Must have an SPA mount point
  const hasSpaRoot = $('#root, #app, #__next, #__nuxt, [data-reactroot]').length > 0;
  if (!hasSpaRoot) return false;

  // 2. Static navigation links? SSR sites have them, true SPAs don't.
  const staticNavLinks = $('a[href^="/"], a[href^="./"]').filter((_, el) => {
    const href = $(el).attr('href') ?? '';
    return !isSkippableExtension(href);
  });
  if (staticNavLinks.length > 3) return false; // SSR — has real navigation

  // 3. Body text content check. True SPAs have almost no visible text
  //    (just "Loading..." or empty). SSR sites have paragraphs, headings, etc.
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  if (bodyText.length > 200) return false; // Has real content — SSR

  return true;
}
