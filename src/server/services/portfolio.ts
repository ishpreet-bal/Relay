import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { addDays } from 'date-fns';
import { logActivity } from './activity';

/**
 * Prospect microsites.
 *
 * A portfolio site is the industry demo from the solution library, hydrated
 * with what research actually found about this specific company, at a URL you
 * can put in an email. It is the strongest asset in the pipeline and also the
 * most exposed — it is public, it carries the prospect's name, and anyone with
 * the link can read it. The constraints below follow from that.
 */

const RESERVED = new Set(['www', 'app', 'api', 'admin', 'mail', 'demo', 'docs', 'status', 'assets']);

export function slugifyCompany(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|corp|corporation|limited|co)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'client';
}

async function uniqueSubdomain(base: string) {
  let candidate = RESERVED.has(base) ? `${base}-demo` : base;
  for (let i = 2; i < 50; i++) {
    const taken = await db.portfolioSite.findUnique({ where: { subdomain: candidate } });
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createPortfolioSite(params: {
  organizationId: string;
  accountId: string;
  userId: string | null;
  templateSlug?: string;
  expiresInDays?: number;
  logoUrl?: string;
  logoConsentNote?: string;
}) {
  const lead = await db.account.findFirstOrThrow({
    where: { id: params.accountId, organizationId: params.organizationId, deletedAt: null },
    include: { research: true, organization: { select: { brandName: true, name: true, brandPrimary: true } } },
  });

  // Match a template by explicit choice, then by industry, then fall back.
  const template = params.templateSlug
    ? await db.solutionTemplate.findFirst({
        where: { slug: params.templateSlug, OR: [{ organizationId: null }, { organizationId: params.organizationId }] },
      })
    : lead.industry
      ? await db.solutionTemplate.findFirst({
          where: {
            isPublished: true,
            industry: { contains: lead.industry.split(/[\s/,]/)[0]!, mode: 'insensitive' },
            OR: [{ organizationId: null }, { organizationId: params.organizationId }],
          },
        })
      : null;

  type Opportunity = { title: string; workflow?: string; hoursPerWeek?: number; citations?: Array<{ url: string; quote: string }> };
  const opportunities = (lead.research?.opportunities ?? []) as unknown as Opportunity[];

  const subdomain = await uniqueSubdomain(slugifyCompany(lead.name));
  const agencyName = lead.organization.brandName ?? lead.organization.name;

  const site = await db.portfolioSite.create({
    data: {
      organizationId: params.organizationId,
      accountId: params.accountId,
      templateId: template?.id ?? null,
      subdomain,
      headline: `What automation could look like at ${lead.name}`,
      subheadline: template
        ? `A working example built around how ${lead.industry ?? 'businesses like yours'} actually run, prepared by ${agencyName}.`
        : `Prepared by ${agencyName}.`,
      // Logos are never scraped. The field stays empty unless someone records
      // that permission was given.
      logoUrl: params.logoUrl ?? null,
      logoConsent: Boolean(params.logoUrl && params.logoConsentNote),
      logoConsentNote: params.logoConsentNote ?? null,
      accentColor: template?.accentColor ?? lead.organization.brandPrimary,
      content: {
        name: lead.name,
        city: lead.city,
        industry: lead.industry,
        summary: lead.research?.companySummary ?? null,
        opportunities: opportunities.map((o) => ({
          title: o.title,
          workflow: o.workflow ?? '',
          hoursPerWeek: o.hoursPerWeek ?? null,
          // Only the source URL travels to the public page, never the quote —
          // reproducing a prospect's own copy back at them on a public URL
          // reads as surveillance rather than diligence.
          sourceUrl: o.citations?.[0]?.url ?? null,
        })),
        estimatedHoursSavedPerMonth: lead.research?.estimatedHoursSavedPerMonth ?? null,
        estimatedAnnualSavingsCents: lead.research?.estimatedAnnualSavingsCents ?? null,
        roiAssumptions: lead.research?.roiAssumptions ?? null,
      } as never,
      isPublished: false,
      expiresAt: addDays(new Date(), params.expiresInDays ?? 60),
    },
  });

  await logActivity({
    organizationId: params.organizationId,
    accountId: params.accountId,
    userId: params.userId,
    type: 'SYSTEM',
    title: 'Demo site created',
    body: `${subdomain} — not published yet.`,
  });

  return site;
}

export async function publishSite(organizationId: string, siteId: string, publish: boolean) {
  return db.portfolioSite.update({
    where: { id: siteId },
    data: { isPublished: publish, publishedAt: publish ? new Date() : null },
  });
}

/** Public lookup. Returns null for anything a visitor shouldn't see. */
export async function getPublicSite(subdomain: string) {
  const site = await db.portfolioSite.findUnique({
    where: { subdomain },
    include: {
      template: true,
      account: { select: { id: true, name: true } },
      organization: { select: { brandName: true, name: true, brandLogoUrl: true, websiteUrl: true } },
    },
  });

  if (!site || !site.isPublished) return null;
  if (site.expiresAt && site.expiresAt < new Date()) return null;
  return site;
}

/**
 * View tracking that stores no raw identifiers. The visitor hash is salted with
 * the site id so the same person visiting two different demos cannot be
 * correlated across them.
 */
export async function recordSiteView(params: {
  siteId: string;
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
  path: string | null;
}) {
  const visitorHash = createHash('sha256')
    .update(`${params.siteId}:${params.ip ?? 'unknown'}:${params.userAgent ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32);

  const priorVisit = await db.portfolioView.findFirst({
    where: { siteId: params.siteId, visitorHash },
  });

  const site = await db.portfolioSite.update({
    where: { id: params.siteId },
    data: {
      viewCount: { increment: 1 },
      ...(priorVisit ? {} : { uniqueVisitors: { increment: 1 } }),
      firstViewedAt: undefined,
    },
    select: { id: true, organizationId: true, accountId: true, firstViewedAt: true, subdomain: true },
  });

  await db.portfolioView.create({
    data: {
      siteId: params.siteId,
      visitorHash,
      referrer: params.referrer?.slice(0, 300) ?? null,
      path: params.path?.slice(0, 200) ?? null,
    },
  });

  // The first visit is a real buying signal and belongs on the timeline.
  if (!site.firstViewedAt) {
    await db.portfolioSite.update({ where: { id: site.id }, data: { firstViewedAt: new Date() } });
    await db.account.update({
      where: { id: site.accountId },
      data: { temperature: 'HOT' },
    });
    await logActivity({
      organizationId: site.organizationId,
      accountId: site.accountId,
      type: 'SYSTEM',
      title: 'Demo site opened',
      body: `Someone opened ${site.subdomain} for the first time.`,
    });
  }
}
