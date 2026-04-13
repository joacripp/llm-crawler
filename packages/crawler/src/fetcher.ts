// packages/crawler/src/fetcher.ts
import axios from 'axios';
import type { Browser } from 'playwright-core';

export async function fetchWithAxios(url: string): Promise<string | null> {
  try {
    const response = await axios.get<string>(url, {
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; llms-txt-crawler/1.0)', Accept: 'text/html' },
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

export async function fetchWithBrowser(browser: Browser, url: string): Promise<string | null> {
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
