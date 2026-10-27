import type { MetadataRoute } from 'next';
import { siteUrl } from '@/site/config';

// The workspace is behind sign-in anyway; this keeps crawlers on the public site.
const PRIVATE = [
  '/api/', '/workspace', '/sign-in', '/sign-up', '/onboarding', '/portal', '/p/', '/u/', '/site/',
  '/accounts', '/analytics', '/assistant', '/billing', '/calls', '/campaigns', '/clients', '/connectors', '/contacts', '/dashboard',
  '/discovery', '/duplicates', '/inquiries', '/meetings', '/no-website', '/opportunities', '/packages', '/pipeline', '/playbooks',
  '/portfolios', '/projects', '/proposals', '/research', '/review', '/sales', '/settings', '/solutions', '/studio', '/suppression', '/system', '/team',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
