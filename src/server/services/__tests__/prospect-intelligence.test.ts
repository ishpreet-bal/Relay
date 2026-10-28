import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractWebsiteContacts } from '../website-contacts';
import { briefFacts, indicativePrice, recommendWorkflows } from '../service-brief';
import { outreachContactBlock } from '../outreach-readiness';
import { redactText, redactValue } from '@/lib/redact';
import { hunterContacts, hunterEmailFinder } from '@/server/connectors/providers/hunter-contacts';

const source = 'https://acme.test/contact';
const facts = briefFacts([{ id: 'r1', statement: 'Acme manufactures precision parts.', citations: [{ url: source, quote: 'We manufacture precision parts', matchType: 'exact' }] }]);

afterEach(() => vi.unstubAllEnvs());

describe('literal business contacts', () => {
  it('keeps mailto, footer, structured data and phones without inferring names or verification', () => {
    const found = extractWebsiteContacts(`<body><footer>Email sales@acme.test <a href="mailto:Sales@acme.test?subject=Hi">sales</a><a href="tel:+1 (905) 555-0101">Call</a></footer><script type="application/ld+json">{"email":"owner@acme.test","telephone":"+1 905 555 0101"}</script><script>evil@tracker.test</script></body>`, source);
    expect(found.map((c) => c.value)).toEqual(['sales@acme.test', '+19055550101', 'owner@acme.test']);
    expect(found.every((c) => c.sourceUrl === source)).toBe(true);
  });
  it('rejects malformed links, reply-disabled addresses and tracking assets', () => {
    expect(extractWebsiteContacts('<body><a href="mailto:%XX">broken</a> noreply@acme.test image@2x.png <a href="tel:42">bad</a></body>', source)).toEqual([]);
  });
});

describe('specific, evidence-backed workflow hypotheses', () => {
  it('requires usable quotes and never treats fuzzy matches as brief evidence', () => {
    expect(briefFacts([{ id: 'x', statement: 'Manufacturing', citations: [{ url: source, quote: 'manufacturing', matchType: 'fuzzy' }] }])).toEqual([]);
    expect(recommendWorkflows([])).toEqual([]);
    expect(briefFacts({ malformed: true })).toEqual([]);
  });
  it('offers a complete concrete workflow, without claiming a known internal problem', () => {
    const [w] = recommendWorkflows(facts);
    expect(w?.key).toBe('quality');
    expect(w?.kind).toBe('HYPOTHESIS_TO_VALIDATE');
    expect(w?.evidence[0]?.id).toBe('r1');
    for (const value of [w?.trigger, w?.output, w?.humanReview, w?.failurePlan]) expect(value?.length).toBeGreaterThan(10);
    expect(w?.validation.length).toBeGreaterThan(1);
  });
  it('prices both setup and managed operation above cost, with labelled assumptions', () => {
    const p = indicativePrice({ buildHours: [10, 20], internalHourlyCents: 4000, dayRateCents: 80000, currency: 'CAD', planningDefaults: true,
      costs: { buildHours: 0, setupCostCents: 10000, hostingCents: 1000, databaseCents: 500, aiCents: 1000, thirdPartyCents: 500, domainCents: 0, monitoringCents: 500, supportHours: 2, maintenanceHours: 1, targetMarginPct: 50 } });
    expect(p.setupLowCents).toBe(125000);
    expect(p.setupHighCents).toBe(250000);
    expect(p.monthlyCents).toBe(31000);
    expect(p.planningDefaults).toBe(true);
    expect(p.label).toMatch(/approval/);
  });
});

describe('outreach prerequisites', () => {
  const now = new Date('2026-10-28T15:00:00Z');
  const msg = { organizationId: 'o', clientId: 'c', accountId: 'a' };
  const contact = { ...msg, emailVerification: 'VALID', emailVerifiedAt: now, consentBasis: 'EXPRESS', consentNote: 'Permission recorded with source' };
  it('blocks unverified, stale, future-dated, risky and unknown-consent contacts', () => {
    expect(outreachContactBlock(contact, msg, now)).toBeNull();
    expect(outreachContactBlock({ ...contact, emailVerifiedAt: null }, msg, now)?.code).toBe('EMAIL_UNVERIFIED');
    expect(outreachContactBlock({ ...contact, emailVerifiedAt: new Date('2026-09-01') }, msg, now)?.code).toBe('EMAIL_UNVERIFIED');
    expect(outreachContactBlock({ ...contact, emailVerifiedAt: new Date('2027-01-01') }, msg, now)?.code).toBe('EMAIL_UNVERIFIED');
    expect(outreachContactBlock({ ...contact, emailVerification: 'CATCH_ALL' }, msg, now)?.code).toBe('EMAIL_UNVERIFIED');
    expect(outreachContactBlock({ ...contact, consentBasis: 'UNKNOWN' }, msg, now)?.code).toBe('CONSENT_REQUIRED');
    expect(outreachContactBlock({ ...contact, consentNote: ' ' }, msg, now)?.code).toBe('CONSENT_REQUIRED');
  });
  it('rejects cross-workspace, cross-client and cross-account recipients', () => {
    for (const key of ['organizationId', 'clientId', 'accountId'] as const) expect(outreachContactBlock({ ...contact, [key]: 'other' }, msg, now)?.code).toBe('CONTACT_SCOPE');
  });
});

describe('secret redaction', () => {
  it('removes raw and encoded environment secrets, URL params, tokens and nested credentials', () => {
    vi.stubEnv('APOLLO_API_KEY', 'fake-test-secret/123');
    const raw = { url: 'https://provider.test?api_key=fake-test-secret%2F123', nested: { authorization: 'Bearer fake', message: 'key fake-test-secret/123' }, access_token: 'access-value', error: new Error('Bearer unknown_token') };
    const safe = JSON.stringify(redactValue(raw));
    expect(safe).not.toMatch(/fake-test-secret|access-value|unknown_token/);
    expect(safe).toContain('REDACTED');
    expect(redactText('postgresql://user:pass@localhost/db')).not.toContain(':pass@');
  });
});

describe('Hunter contact fallback contracts', () => {
  it('normalizes domain results and keeps historical verification unverified until checked', async () => {
    vi.stubEnv('HUNTER_API_KEY', 'test-hunter-key');
    const fetcher = vi.fn(async () => Response.json({ data: { emails: [{ value: 'Owner@acme.test', first_name: 'Sam', last_name: 'Lee', verification: { status: 'valid' }, sources: [{ uri: source }] }] } }));
    const r = await hunterContacts(fetcher).findContacts({ domain: 'acme.test', titles: [], seniorities: [], limit: 3 }, { organizationId: 'o' });
    expect(r.data?.[0]).toMatchObject({ email: 'owner@acme.test', emailVerification: 'UNVERIFIED', sourceUrl: source });
    expect(fetcher.mock.calls.length).toBe(1);
  });
  it('does not expose key-echoing error pages or guess an email on a miss', async () => {
    vi.stubEnv('HUNTER_API_KEY', 'test-hunter-key');
    const bad = vi.fn(async () => new Response('key=test-hunter-key', { status: 403 }));
    await expect(hunterContacts(bad).findContacts({ domain: 'acme.test', titles: [], seniorities: [], limit: 3 }, { organizationId: 'o' })).rejects.toThrow('403');
    await expect(hunterContacts(bad).findContacts({ domain: 'acme.test', titles: [], seniorities: [], limit: 3 }, { organizationId: 'o' })).rejects.not.toThrow('test-hunter-key');
    const miss = vi.fn(async () => Response.json({ data: { email: null } }));
    expect((await hunterEmailFinder(miss).findEmail({ domain: 'acme.test', firstName: 'Sam', lastName: 'Lee' }, { organizationId: 'o' })).status).toBe('NOT_FOUND');
  });
});
