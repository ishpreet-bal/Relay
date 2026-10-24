import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Website inquiries on a real Postgres: stored as sent, linked into the CRM
 * with consent recorded, spam kept out of it, abuse rate-limited, and a
 * suggested consultation time booked as a meeting.
 */

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { submitInquiry, listInquiries, bookConsultation, relinkInquiry, InvalidInquiryError, RateLimitedError } = await import('../inquiries');
const { systemAccess } = await import('@/server/access/scope');
const { consultationSlots } = await import('@/site/consultation');

describe.skipIf(!reachable)('website inquiries (database)', () => {
  const orgId = randomUUID();
  let clientId = '';
  let userId = '';
  const access = () => systemAccess(orgId);
  const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;
  const base = (over: Record<string, unknown> = {}) => ({
    name: 'Dana Smith', company: `Corner Salon ${randomUUID().slice(0, 6)}`, email: `dana-${randomUUID().slice(0, 6)}@corner-salon.test`,
    service: 'WEBSITES', message: 'We just opened and need a website with online booking.', startedAt: Date.now() - 60_000, ...over,
  });

  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Inquiry test', slug: `inq-${orgId.slice(0, 8)}` } });
    clientId = (await db.client.create({ data: { organizationId: orgId, name: 'Relay', slug: `relay-${orgId.slice(0, 6)}`, kind: 'INTERNAL' } })).id;
    userId = (await db.user.create({ data: { clerkUserId: `test_${orgId}_u`, email: `inq-${orgId.slice(0, 8)}@example.test` } })).id;
    process.env.INQUIRY_CLIENT_ID = clientId;
  });

  afterAll(async () => {
    delete process.env.INQUIRY_CLIENT_ID;
    if (reachable) {
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it('stores the inquiry and links it into the CRM with implied consent and a task', async () => {
    const input = base({ phone: '(905) 555-0142', website: 'corner-salon.test', industry: 'Spas, salons & local services' });
    const { id } = await submitInquiry(input as never, { ip: '203.0.113.7' });
    const q = await db.inquiry.findUniqueOrThrow({ where: { id } });
    expect(q).toMatchObject({ status: 'NEW', category: 'WEBSITE', categorySource: 'visitor', clientId });
    expect(q.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(q)).not.toContain('203.0.113.7');

    const account = await db.account.findUniqueOrThrow({ where: { id: q.accountId! }, include: { contacts: true } });
    expect(account).toMatchObject({ name: input.company, source: 'INBOUND', domain: 'corner-salon.test' });
    expect(account.tags).toEqual(expect.arrayContaining(['website-inquiry', 'website-development']));
    expect(account.contacts[0]).toMatchObject({ firstName: 'Dana', lastName: 'Smith', email: input.email, consentBasis: 'IMPLIED_RELATIONSHIP' });
    expect(account.contacts[0]!.consentNote).toMatch(/six months/);
    const task = await db.task.findUniqueOrThrow({ where: { id: q.taskId! } });
    expect(task).toMatchObject({ accountId: account.id, status: 'OPEN', priority: 1 });
    expect(await db.activity.count({ where: { accountId: account.id, type: 'NOTE' } })).toBe(1);
  });

  it('records an opt-in as express consent, and upgrades an existing contact', async () => {
    const first = base();
    await submitInquiry(first as never, { ip: ip() });
    const { id } = await submitInquiry({ ...first, marketingConsent: true, message: 'Following up: also interested in updates.' } as never, { ip: ip() });
    const q = await db.inquiry.findUniqueOrThrow({ where: { id } });
    expect(q.consentText).toMatch(/unsubscribe/);
    const contacts = await db.contact.findMany({ where: { email: first.email } });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.consentBasis).toBe('EXPRESS');
  });

  it('works out a "not sure" inquiry’s category from what it says', async () => {
    const { id } = await submitInquiry(base({ service: 'NOT_SURE', message: 'Our team re-types invoices from email into spreadsheets every day.' }) as never, { ip: ip() });
    expect(await db.inquiry.findUniqueOrThrow({ where: { id } })).toMatchObject({ category: 'AUTOMATION', categorySource: 'inferred' });
  });

  it('keeps likely spam out of the CRM, and lets a person put it back', async () => {
    const bot = await submitInquiry(base({ companyWebsite: 'http://spam.test' }) as never, { ip: ip() });
    const fast = await submitInquiry(base({ startedAt: Date.now() - 300 }) as never, { ip: ip() });
    for (const { id } of [bot, fast]) expect(await db.inquiry.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'SPAM', accountId: null });
    const listed = await listInquiries(access());
    expect(listed.items.some((i) => i.id === bot.id)).toBe(false);
    expect(listed.items.every((i) => !('ipHash' in i))).toBe(true);
    const { accountId } = await relinkInquiry(access(), fast.id);
    expect(await db.inquiry.findUniqueOrThrow({ where: { id: fast.id } })).toMatchObject({ status: 'NEW', accountId });
  });

  it('refuses bad input and repeated sends', async () => {
    await expect(submitInquiry(base({ email: 'not-an-email' }) as never, { ip: ip() })).rejects.toBeInstanceOf(InvalidInquiryError);
    await expect(submitInquiry(base({ preferredTimes: ['2026-10-24T14:00:00.000Z'] }) as never, { ip: ip() })).rejects.toBeInstanceOf(InvalidInquiryError);
    const same = '192.0.2.44';
    for (let i = 0; i < 5; i++) await submitInquiry(base() as never, { ip: same });
    await expect(submitInquiry(base() as never, { ip: same })).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('books one of the suggested times as a meeting and closes the task', async () => {
    const offered = consultationSlots(new Date()).flatMap((d) => d.slots).slice(0, 2).map((s) => s.iso);
    const { id } = await submitInquiry(base({ preferredTimes: offered }) as never, { ip: ip() });
    await expect(bookConsultation(access(), userId, id, new Date(Date.now() + 7 * 86_400_000).toISOString())).rejects.toThrow(/suggested/);
    const { meetingId } = await bookConsultation(access(), userId, id, offered[1]!);
    const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    expect(meeting).toMatchObject({ source: 'INBOUND', status: 'BOOKED', bookedById: userId, clientId });
    expect(meeting.startsAt.toISOString()).toBe(offered[1]);
    const q = await db.inquiry.findUniqueOrThrow({ where: { id } });
    expect(q).toMatchObject({ status: 'BOOKED', meetingId });
    expect((await db.task.findUniqueOrThrow({ where: { id: q.taskId! } })).status).toBe('DONE');
  });
});
