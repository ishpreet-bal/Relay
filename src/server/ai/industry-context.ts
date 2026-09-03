import { db } from '@/lib/db';
import type { Fact } from './prompts/personalize';

/**
 * Seed statements for the industry context library. These are intentionally
 * modest and process-focused: they describe categories of work the agency does,
 * not results it achieved. An operator should edit these to match what their
 * agency can actually stand behind, and any claim they wouldn't say out loud on
 * a call should be deleted.
 *
 * Nothing here asserts anything about a recipient. That's the point.
 */
export const SEED_INDUSTRY_CONTEXT: Record<string, string[]> = {
  dental: [
    'Most dental practices we talk to still confirm appointments by phone, one call at a time.',
    'We build intake and recall reminders that write back into the practice management system.',
    'Insurance verification is usually the task front desk staff name first when asked what they would hand off.',
  ],
  medical: [
    'Clinics we work with typically handle referrals and intake forms as paper or PDF, then retype them.',
    'We automate referral triage and appointment reminders without touching the clinical record.',
  ],
  law: [
    'Firms we work with usually assemble client intake and conflict checks by hand.',
    'We build document assembly and matter-opening workflows that keep the file structure the firm already uses.',
  ],
  accounting: [
    'Accounting teams we work with spend the most time chasing client documents during filing season.',
    'We build client-request portals that follow up on missing documents automatically.',
  ],
  hvac: [
    'Field service teams we work with often rebook and dispatch entirely over the phone.',
    'We connect scheduling, dispatch, and invoicing so a completed job produces its own paperwork.',
  ],
  electrical: [
    'Trades we work with usually write quotes by hand and rekey them into accounting later.',
    'We automate quote-to-invoice so a signed estimate becomes a job and an invoice without retyping.',
  ],
  plumbing: [
    'Service businesses we work with lose time to after-hours call handling and manual dispatch.',
    'We build intake and scheduling flows that capture jobs outside business hours.',
  ],
  construction: [
    'Contractors we work with track subtrade documents and site reports across email and spreadsheets.',
    'We build daily-report and compliance-document workflows that assemble themselves from the field.',
  ],
  manufacturing: [
    'Manufacturers we work with often bridge production and accounting with manual spreadsheet exports.',
    'We automate production reporting and order status so the office stops asking the floor for updates.',
  ],
  'auto repair': [
    'Shops we work with confirm appointments and approvals by phone, then chase customers for authorization.',
    'We build approval and status-update flows so customers respond without a phone call.',
  ],
  logistics: [
    'Dispatch teams we work with rekey the same load information into three systems.',
    'We connect dispatch, tracking, and billing so a delivered load closes itself out.',
  ],
  'property management': [
    'Property managers we work with take maintenance requests by phone and email, then log them by hand.',
    'We build request intake and vendor dispatch that keeps an audit trail per unit.',
  ],
  insurance: [
    'Brokerages we work with rekey application data between carrier portals.',
    'We automate renewal reminders and document collection ahead of the renewal date.',
  ],
};

/** Generic fallback when the industry is unknown or has no entries. */
const GENERIC: string[] = [
  'We build automations for small teams that are doing repetitive work by hand.',
  'Most of our projects start with one workflow that everyone in the office already complains about.',
];

/**
 * Builds the CONTEXTUAL ledger. Org-authored statements win; seeds fill gaps so
 * a new workspace is usable on day one. Every fact is marked kind:'agency' so
 * the linter knows it describes the sender, never the recipient.
 */
export async function buildContextualLedger(
  organizationId: string,
  industry: string | null,
): Promise<Fact[]> {
  const normalized = industry?.toLowerCase().trim() ?? '';

  const owned = await db.industryContext.findMany({
    where: { organizationId, isActive: true, ...(normalized ? { industry: normalized } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 6,
  });

  const statements = owned.length
    ? owned.map((o) => o.statement)
    : (Object.entries(SEED_INDUSTRY_CONTEXT).find(([key]) => normalized.includes(key))?.[1] ?? GENERIC);

  return statements.slice(0, 5).map((statement, i) => ({
    id: `f${i + 1}`,
    statement,
    sourceUrl: null,
    kind: 'agency' as const,
  }));
}
