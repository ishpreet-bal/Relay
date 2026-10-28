import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { isPublicSitePath } from '@/site/public-routes';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';

const isPublic = createRouteMatcher([
  // The public website. Nothing under these paths reads private data.
  '/',
  '/about',
  '/privacy',
  '/services(.*)',
  '/industries',
  '/demos(.*)',
  '/how-it-works',
  '/contact',
  '/api/inquiries', // the website's inquiry form: validated, rate-limited, write-only
  '/robots.txt',
  '/sitemap.xml',
  '/opengraph-image(.*)', // the share preview image, generated without a file extension
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/onboarding(.*)',
  '/api/webhooks/(.*)', // signature-verified, not session-authenticated
  '/api/health',
  '/api/cron/(.*)', // bearer-token authenticated (CRON_SECRET)
  '/api/studio/hooks/(.*)', // bearer-token authenticated (per-application webhook token)
  '/u/(.*)', // unsubscribe page, must never require a login
  '/api/unsubscribe/(.*)', // RFC 8058 one-click POST from mailbox providers
  '/p/(.*)', // public proposal share links
  '/site/(.*)', // portfolio microsite renderer
]);

const authenticatedMiddleware = clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get('host') ?? '';
  const root = process.env.PORTFOLIO_ROOT_DOMAIN ?? '';

  // Wildcard subdomains serve prospect microsites (Module 9). Rewritten to an
  // internal route before auth runs, so a prospect never meets a login wall.
  if (root && host.endsWith(root) && host !== root) {
    const subdomain = host.slice(0, -(root.length + 1));
    if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
      const url = req.nextUrl.clone();
      url.pathname = `/site/${subdomain}${req.nextUrl.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (isPublic(req)) return;

  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  // A signed-in user with no active organization has nowhere to put data.
  // OrgAutoActivate (mounted in the root layout) sets one automatically for
  // users with an existing membership; this only catches users with none.
  if (!orgId && !req.nextUrl.pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }
});

/** Public pages stay available even when the identity provider is unavailable.
 * Auth pages and every unknown/private path still run Clerk's middleware.
 */
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get('host') ?? '';
  const root = process.env.PORTFOLIO_ROOT_DOMAIN ?? '';
  const portfolioHost = !!root && host.endsWith(root) && host !== root;
  if (!portfolioHost && isPublicSitePath(req.nextUrl.pathname)) return NextResponse.next();
  return authenticatedMiddleware(req, event);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/api/(.*)'],
};
