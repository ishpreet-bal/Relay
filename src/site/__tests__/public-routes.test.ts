import { expect, it } from 'vitest';
import { isPublicSitePath } from '../public-routes';
it('keeps only explicit public website routes independent of authentication', () => {
  for (const path of ['/', '/demos', '/demos/quality-report', '/services/automation', '/api/health', '/api/inquiries']) expect(isPublicSitePath(path)).toBe(true);
  for (const path of ['/workspace', '/accounts', '/contacts', '/connectors', '/packages', '/api/trpc/accounts.brief', '/api/export/accounts', '/sign-in', '/portal', '/services-private', '/demos-private', '/unknown']) expect(isPublicSitePath(path)).toBe(false);
});
