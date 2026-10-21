import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const isPublic = createRouteMatcher([
  '/',
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

export default clerkMiddleware(async (auth, req: NextRequest) => {
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

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/api/(.*)'],
};
