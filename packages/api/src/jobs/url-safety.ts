import { lookup } from 'dns/promises';

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
 * Resolve hostname and verify the IP is not private/internal.
 * Returns null with a reason if blocked, or the resolved IP if safe.
 *
 * Catches DNS rebinding attacks where a public domain resolves
 * to a private IP (e.g. evil.com → 169.254.169.254).
 */
export async function verifyUrlDns(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  // IP literal — check directly
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith('[')) {
    const ip = hostname.replace(/[[\]]/g, '');
    if (isBlockedIp(ip)) {
      return { ok: false, reason: `URL points to a private network address (${ip})` };
    }
    return { ok: true };
  }

  // Resolve DNS
  try {
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) {
      return { ok: false, reason: `"${hostname}" resolves to a private network address (${address})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: `Could not resolve "${hostname}" — check the URL and try again` };
  }
}
