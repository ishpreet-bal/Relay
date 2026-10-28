/** Only site pages and independently protected public endpoints bypass Clerk. */
export function isPublicSitePath(path: string): boolean {
  if (['/', '/about', '/privacy', '/industries', '/how-it-works', '/contact', '/robots.txt', '/sitemap.xml', '/api/inquiries', '/api/health'].includes(path)) return true;
  return path === '/services' || path.startsWith('/services/') || path === '/demos' || path.startsWith('/demos/')
    || /^\/opengraph-image(?:\.[a-z]+)?$/.test(path);
}
