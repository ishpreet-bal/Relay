import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));
import { crawlSite, robotsAllowed } from '../crawler';
afterEach(() => vi.unstubAllGlobals());

describe('website coverage', () => {
  it('finds contact links in navigation before text cleanup and keeps short contact pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      const html = url.endsWith('/contact') ? '<html><title>Contact Acme</title><body><a href="mailto:hello@acme.test">Email us</a></body></html>'
        : '<html><body><nav><a href="/contact">Contact</a></nav><main>Acme manufactures precision components for businesses.</main><footer><a href="tel:+19055550101">Call</a></footer></body></html>';
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    }));
    const result = await crawlSite('https://acme.test');
    expect(result.pages.map((p) => p.url)).toEqual(['https://acme.test/', 'https://acme.test/contact']);
    expect(result.contacts?.map((c) => c.value)).toContain('hello@acme.test');
    expect(result.contacts?.map((c) => c.value)).toContain('+19055550101');
    expect(result.coverage).toMatchObject({ visited: 2, truncated: false, contactPageFound: true });
  });
  it('reports robots failures rather than silently treating blocked sites as researched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 503 })));
    const result = await crawlSite('https://acme.test');
    expect(result.pages).toEqual([]);
    expect(result.errors[0]?.reason).toMatch(/robots/);
  });
});

describe('robots selection', () => {
  it('uses agent groups, longest-match rules, wildcards and allow exceptions', () => {
    const txt = 'User-agent: *\nDisallow: /\nUser-agent: RelayBot\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$';
    expect(robotsAllowed(txt, '/contact')).toBe(true);
    expect(robotsAllowed(txt, '/private')).toBe(false);
    expect(robotsAllowed(txt, '/private/public/about')).toBe(true);
    expect(robotsAllowed(txt, '/rates.pdf')).toBe(false);
    expect(robotsAllowed(txt, '/rates.pdf/info')).toBe(true);
    expect(robotsAllowed(txt, '/ratesXpdf')).toBe(true);
    expect(robotsAllowed('User-agent: Other\nUser-agent: RelayBot\nDisallow: /secret', '/secret')).toBe(false);
  });
});
