import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Fetching URLs that came from outside — a website a listing supplied, a
 * link on a prospect's page — without letting one point the server at
 * itself or its network. Only http(s) on default ports, only hosts that
 * resolve to public addresses, and redirects are followed by hand so every
 * hop is checked.
 */

export class BlockedUrlError extends Error {}

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = address.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new BlockedUrlError('Not a valid URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedUrlError('Only http and https are allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new BlockedUrlError('Non-standard port');
  if (url.username || url.password) throw new BlockedUrlError('Credentials in URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new BlockedUrlError('Local host');
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new BlockedUrlError('Host does not resolve');
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new BlockedUrlError('Host resolves to a private address');
  return url;
}

/** fetch() for outside URLs: every hop checked, at most `maxRedirects` hops. */
export async function safeFetch(raw: string, init: RequestInit & { maxRedirects?: number } = {}): Promise<Response> {
  const { maxRedirects = 4, ...rest } = init;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...rest, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    // Callers read res.url for the final address; a manual-redirect
    // response already carries it.
    return res;
  }
  throw new BlockedUrlError('Too many redirects');
}
