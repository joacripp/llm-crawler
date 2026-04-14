// packages/crawler/src/fetcher.ts
import { lookup } from 'dns/promises';
import axios from 'axios';
import type { Browser } from 'playwright-core';
import { createLogger } from '@llm-crawler/shared';

const log = createLogger('fetcher');

/**
 * Blocked IP ranges. Checked after DNS resolution to prevent DNS rebinding
 * attacks (attacker registers evil.com → 169.254.169.254).
 *
 * This is defense-in-depth — the API DTO validator already blocks obvious
 * private hostnames/IPs at job creation. The fetcher catches the case where
 * a public domain resolves to a private IP.
 */
const BLOCKED_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // private class A
  /^172\.(1[6-9]|2\d|3[01])\./, // private class B
  /^192\.168\./, // private class C
  /^169\.254\./, // link-local + AWS metadata
  /^0\./, // current network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 private
  /^fe80:/, // IPv6 link-local
  /^fd/, // IPv6 unique local
];

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some((p) => p.test(ip));
}

/**
 * Resolve hostname to IP and verify it's not a private/internal address.
 * Returns the resolved IP if safe, null if blocked or unresolvable.
 */
async function resolveAndVerify(hostname: string): Promise<string | null> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith('[')) {
    return isBlockedIp(hostname.replace(/[[\]]/g, '')) ? null : hostname;
  }

  try {
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) {
      log.warn('DNS resolved to blocked IP', { hostname, ip: address });
      return null;
    }
    return address;
  } catch {
    return null;
  }
}

export async function fetchWithAxios(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    const resolvedIp = await resolveAndVerify(parsed.hostname);
    if (!resolvedIp) {
      log.warn('Blocked fetch to private/internal IP', { url });
      return null;
    }

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
  try {
    const parsed = new URL(url);
    const resolvedIp = await resolveAndVerify(parsed.hostname);
    if (!resolvedIp) {
      log.warn('Blocked browser fetch to private/internal IP', { url });
      return null;
    }
  } catch {
    return null;
  }

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
