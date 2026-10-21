import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
const { confirmName, parseSiteIdentity } = await import('../site-identity');

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe('parseSiteIdentity', () => {
  it('reads schema.org LocalBusiness data', () => {
    const html = page(`
      <title>Home | Acme Machining</title>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'Acme Machining Inc.', telephone: '+1 905-555-0101',
        address: { '@type': 'PostalAddress', streetAddress: '12 Dundas St E', addressLocality: 'Mississauga', addressRegion: 'ON', postalCode: 'L5A 1W2', addressCountry: 'CA' },
      })}</script>`);
    const id = parseSiteIdentity(html, 'https://acme.example/');
    expect(id.names[0]).toBe('Acme Machining Inc.');
    expect(id.phone).toBe('+1 905-555-0101');
    expect(id.address).toEqual({ street: '12 Dundas St E', city: 'Mississauga', region: 'ON', postalCode: 'L5A 1W2', country: 'CA' });
  });

  it('finds the business inside an @graph and ignores the WebSite node', () => {
    const html = page(`<script type="application/ld+json">${JSON.stringify({
      '@graph': [{ '@type': 'WebSite', name: 'Acme – Precision Parts' }, { '@type': ['Organization', 'Corporation'], name: 'Acme Machining Ltd' }],
    })}</script>`);
    expect(parseSiteIdentity(html, 'https://acme.example/').names).toEqual(['Acme Machining Ltd']);
  });

  it('survives malformed JSON-LD and falls back to meta tags, title and tel: links', () => {
    const html = page(
      `<script type="application/ld+json">{not json</script><meta property="og:site_name" content="Brampton Dental"><title>Welcome | Brampton Dental Care</title><meta name="description" content="Family dentistry in Brampton.">`,
      `<a href="tel:+19055550199">Call</a><a href="https://www.facebook.com/bramptondental">fb</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>`,
    );
    const id = parseSiteIdentity(html, 'https://bd.example/');
    expect(id.names).toEqual(['Brampton Dental', 'Brampton Dental Care']);
    expect(id.phone).toBe('+19055550199');
    expect(id.description).toBe('Family dentistry in Brampton.');
    expect(id.socialProfiles).toEqual({ facebook: 'https://www.facebook.com/bramptondental' });
    expect(id.address).toBeNull();
  });

  it('rejects phone fragments', () => {
    expect(parseSiteIdentity(page('', '<a href="tel:555">x</a>'), 'https://x.example/').phone).toBeNull();
  });

  it('does not keep script content in the text it compares names against', () => {
    const id = parseSiteIdentity(page('', '<p>Hello</p><script>var secret="Acme"</script>'), 'https://x.example/');
    expect(id.text).not.toContain('acme');
  });
});

describe('confirmName', () => {
  const identity = (names: string[], text = '') => ({ url: 'https://x.example/', names, phone: null, address: null, socialProfiles: {}, description: null, text });

  it('accepts a close match and records the site\'s spelling', () => {
    expect(confirmName(identity(['ACME Machining Inc.']), 'Acme Machining')).toMatchObject({ name: 'ACME Machining Inc.' });
  });

  it('accepts the listed name when it is written on the page', () => {
    expect(confirmName(identity(['Home'], 'welcome to acme machining, family owned since 1987'), 'Acme Machining')).toMatchObject({ name: 'Acme Machining' });
  });

  it('rejects a site that belongs to someone else', () => {
    expect(confirmName(identity(['Northern Logistics'], 'freight and warehousing'), 'Acme Machining')).toBeNull();
  });
});
