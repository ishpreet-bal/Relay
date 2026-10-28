import * as cheerio from 'cheerio';

export interface WebsiteContact {
  kind: 'EMAIL' | 'PHONE';
  value: string;
  sourceUrl: string;
  label: string;
}

/** Literal published business details only. No guessed email patterns or names. */
export function extractWebsiteContacts(html: string, sourceUrl: string): WebsiteContact[] {
  const $ = cheerio.load(html);
  const found = new Map<string, WebsiteContact>();
  const add = (kind: WebsiteContact['kind'], raw: string, label = 'Published business contact') => {
    const value = kind === 'EMAIL' ? raw.trim().toLowerCase() : raw.replace(/[^\d+]/g, '');
    if (kind === 'EMAIL' && (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) || value.length > 254 || /^(no-?reply|donotreply)@/.test(value) || /\.(png|jpg|svg|webp)$/i.test(value))) return;
    if (kind === 'PHONE' && (value.replace(/\D/g, '').length < 7 || value.length > 16)) return;
    found.set(`${kind}:${value}`, { kind, value, sourceUrl, label: label.slice(0, 160) });
  };
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    try {
      if (/^mailto:/i.test(href)) decodeURIComponent(href.slice(7).split('?')[0]!).split(/[;,]/).forEach((e) => add('EMAIL', e));
      if (/^tel:/i.test(href)) add('PHONE', decodeURIComponent(href.slice(4).split(';')[0]!));
    } catch { /* malformed percent encoding is not a contact */ }
  });
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (v: unknown, depth = 0) => {
        if (!v || typeof v !== 'object' || depth > 10) return;
        for (const [key, value] of Object.entries(v)) {
          if (typeof value === 'string' && key === 'email') add('EMAIL', value.replace(/^mailto:/i, ''));
          if (typeof value === 'string' && key === 'telephone') add('PHONE', value);
          if (typeof value === 'object') walk(value, depth + 1);
        }
      };
      walk(JSON.parse($(el).text()));
    } catch { /* malformed structured data */ }
  });
  $('script,style,noscript').remove();
  for (const email of $('body').text().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) add('EMAIL', email);
  return [...found.values()].slice(0, 30);
}
