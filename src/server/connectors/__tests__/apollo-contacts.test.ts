import { afterEach, expect, it, vi } from 'vitest';
import { apolloConnector } from '../providers/apollo';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('reveals by person ID without a surname and never requests personal emails or phone credits', async () => {
  vi.stubEnv('APOLLO_API_KEY', 'synthetic-apollo-key');
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toEqual({ id: 'p-1', reveal_personal_emails: false, reveal_phone_number: false });
    return Response.json({ person: { id: 'p-1', first_name: 'Sam', last_name: 'Lee', email: 'sam@acme.test', email_status: 'verified', organization: { primary_domain: 'acme.test' } } });
  });
  vi.stubGlobal('fetch', fetcher);
  const r = await apolloConnector.emailFinder!.findEmail({ externalId: 'p-1', firstName: 'Sam', lastName: '', domain: 'acme.test' }, { organizationId: 'test' });
  expect(r.data).toMatchObject({ email: 'sam@acme.test', firstName: 'Sam', lastName: 'Lee' });
});
it('rejects email placeholders and a reported current employer mismatch', async () => {
  vi.stubEnv('APOLLO_API_KEY', 'synthetic-apollo-key');
  for (const person of [{ email: 'email_not_unlocked@domain.com' }, { email: 'sam@other.test', organization: { primary_domain: 'other.test' } }]) {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ person })));
    const r = await apolloConnector.emailFinder!.findEmail({ externalId: 'p-1', firstName: '', lastName: '', domain: 'acme.test' }, { organizationId: 'test' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.data).toBeUndefined();
  }
});
