import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextFetchEvent } from 'next/server';
const session = vi.hoisted(() => ({ userId: null as string | null, orgId: null as string | null }));
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (fn: (auth: () => Promise<typeof session>, req: NextRequest) => unknown) => (req: NextRequest) => fn(async () => session, req),
  createRouteMatcher: (paths: string[]) => (req: NextRequest) => paths.some(path => new RegExp(`^${path}$`).test(req.nextUrl.pathname)),
}));
import middleware from '../middleware';
const run = (path: string) => middleware(new NextRequest(`https://relay.test${path}`), {} as NextFetchEvent);
beforeEach(() => { session.userId = null; session.orgId = null; vi.stubEnv('PORTFOLIO_ROOT_DOMAIN', ''); });
describe('API session boundaries', () => {
  it('lets tRPC produce structured unauthorized errors instead of HTML redirects', async () => {
    expect(await run('/api/trpc/session.me')).toBeUndefined();
    expect(await run('/api/trpc')).toBeUndefined();
  });
  it('keeps private pages behind sign-in and APIs behind a JSON authorization response', async () => {
    const page = await run('/contacts');
    expect(page?.headers.get('location')).toBe('https://relay.test/sign-in');
    const api = await run('/api/export/contacts');
    expect(api?.status).toBe(401);
    expect(await api?.json()).toMatchObject({ error: 'UNAUTHORIZED' });
  });
  it('returns a JSON workspace error for APIs without an active organization', async () => {
    session.userId = 'signed-in';
    expect((await run('/api/export/contacts'))?.status).toBe(403);
    expect((await run('/contacts'))?.headers.get('location')).toBe('https://relay.test/onboarding');
  });
  it('does not bypass auth for a similarly named unknown route', async () => {
    expect((await run('/api/trpc-other'))?.status).toBe(401);
  });
});
