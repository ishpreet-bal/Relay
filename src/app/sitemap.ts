import type { MetadataRoute } from 'next';
import { siteUrl } from '@/site/config';
import { SERVICES } from '@/site/content/services';
import { DEMOS } from '@/site/demos/catalog';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/services', priority: 0.9 },
    ...SERVICES.map((s) => ({ path: s.href, priority: 0.9 })),
    { path: '/industries', priority: 0.8 },
    { path: '/demos', priority: 0.8 },
    ...DEMOS.map((d) => ({ path: `/demos/${d.slug}`, priority: 0.6 })),
    { path: '/how-it-works', priority: 0.7 },
    { path: '/contact', priority: 0.8 },
    { path: '/about', priority: 0.5 },
    { path: '/privacy', priority: 0.3 },
  ];
  return pages.map((p) => ({ url: `${base}${p.path === '/' ? '' : p.path}`, changeFrequency: 'monthly', priority: p.priority }));
}
