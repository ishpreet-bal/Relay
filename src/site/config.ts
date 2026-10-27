/**
 * The public website's identity in one place. The company name is
 * provisional: changing BRAND.name (and the wordmark) renames the site.
 */
export const BRAND = {
  name: 'Relay',
  tagline: 'You focus on running your business. We handle the technology.',
  description:
    'Relay designs, builds and runs custom software, automation and customer acquisition systems for businesses, then keeps them working. One provider, one price, fully managed.',
  region: 'Ontario, Canada',
  timezone: 'America/Toronto',
} as const;

/** The site's canonical origin, used for metadata, the sitemap and links in emails. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * Public addresses at the company's own domain, once it has one. Set
 * SITE_EMAIL_DOMAIN (for example "example.ca") after the Google Workspace
 * mailboxes exist; until then the site shows only the inquiry form.
 */
export function siteEmails(): { hello: string; sales: string; support: string; founder: string } | null {
  const domain = process.env.SITE_EMAIL_DOMAIN?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return { hello: `hello@${domain}`, sales: `sales@${domain}`, support: `support@${domain}`, founder: `founder@${domain}` };
}

export const NAV = [
  { href: '/services', label: 'Services' },
  { href: '/industries', label: 'Industries' },
  { href: '/demos', label: 'Demos' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
] as const;
