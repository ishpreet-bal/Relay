import { db } from '@/lib/db';
import type { Plan } from '@prisma/client';
import { startOfMonth } from 'date-fns';

/**
 * Plan enforcement.
 *
 * Limits are checked at the point of action rather than on a nightly sweep, so
 * a workspace cannot exceed its plan and then be retroactively punished. The
 * failure message always names the limit and the plan that lifts it — an
 * unexplained refusal is a support ticket.
 */

export interface PlanLimits {
  seats: number;
  leads: number;
  researchRunsPerMonth: number;
  sendsPerMonth: number;
  activeCampaigns: number;
  portfolioSites: number;
  customTemplates: boolean;
  apiAccess: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  TRIAL:  { seats: 2,  leads: 250,     researchRunsPerMonth: 50,     sendsPerMonth: 200,    activeCampaigns: 1,  portfolioSites: 3,   customTemplates: false, apiAccess: false },
  SOLO:   { seats: 1,  leads: 2_500,   researchRunsPerMonth: 400,    sendsPerMonth: 1_500,  activeCampaigns: 3,  portfolioSites: 25,  customTemplates: false, apiAccess: false },
  AGENCY: { seats: 5,  leads: 25_000,  researchRunsPerMonth: 2_500,  sendsPerMonth: 10_000, activeCampaigns: 15, portfolioSites: 200, customTemplates: true,  apiAccess: true },
  SCALE:  { seats: 25, leads: 250_000, researchRunsPerMonth: 20_000, sendsPerMonth: 75_000, activeCampaigns: 100, portfolioSites: 2_000, customTemplates: true, apiAccess: true },
};

export const PLAN_NAMES: Record<Plan, string> = {
  TRIAL: 'Trial', SOLO: 'Solo', AGENCY: 'Agency', SCALE: 'Scale',
};

export class PlanLimitError extends Error {
  constructor(public limit: keyof PlanLimits, message: string) {
    super(message);
    this.name = 'PlanLimitError';
  }
}

export async function getUsage(organizationId: string) {
  const monthStart = startOfMonth(new Date());

  const [org, seats, leads, research, sends, campaigns, sites] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.membership.count({ where: { organizationId } }),
    db.account.count({ where: { organizationId, deletedAt: null } }),
    db.aiRun.count({ where: { organizationId, kind: 'research', createdAt: { gte: monthStart } } }),
    db.message.count({ where: { organizationId, direction: 'OUTBOUND', sentAt: { gte: monthStart } } }),
    db.campaign.count({ where: { organizationId, status: 'ACTIVE' } }),
    db.portfolioSite.count({ where: { organizationId } }),
  ]);

  const limits = PLAN_LIMITS[org.plan];
  const trialExpired = org.plan === 'TRIAL' && org.trialEndsAt !== null && org.trialEndsAt < new Date();

  return {
    plan: org.plan,
    planName: PLAN_NAMES[org.plan],
    trialEndsAt: org.trialEndsAt,
    trialExpired,
    limits,
    usage: { seats, leads, research, sends, campaigns, sites },
  };
}

export async function assertWithinPlan(organizationId: string, limit: keyof PlanLimits, adding = 1) {
  const { plan, planName, limits, usage, trialExpired } = await getUsage(organizationId);

  if (trialExpired) {
    throw new PlanLimitError('seats', 'Your trial has ended. Choose a plan in Settings to keep working.');
  }

  const map: Partial<Record<keyof PlanLimits, { used: number; cap: number; noun: string }>> = {
    seats: { used: usage.seats, cap: limits.seats, noun: 'team members' },
    leads: { used: usage.leads, cap: limits.leads, noun: 'leads' },
    researchRunsPerMonth: { used: usage.research, cap: limits.researchRunsPerMonth, noun: 'research runs this month' },
    sendsPerMonth: { used: usage.sends, cap: limits.sendsPerMonth, noun: 'emails this month' },
    activeCampaigns: { used: usage.campaigns, cap: limits.activeCampaigns, noun: 'active campaigns' },
    portfolioSites: { used: usage.sites, cap: limits.portfolioSites, noun: 'demo sites' },
  };

  const entry = map[limit];
  if (entry && entry.used + adding > entry.cap) {
    const nextPlan = plan === 'TRIAL' || plan === 'SOLO' ? 'Agency' : 'Scale';
    throw new PlanLimitError(
      limit,
      `The ${planName} plan allows ${entry.cap.toLocaleString('en-CA')} ${entry.noun}. Upgrade to ${nextPlan} to raise this.`,
    );
  }

  if (limit === 'customTemplates' && !limits.customTemplates) {
    throw new PlanLimitError(limit, `Customizing solution templates is available on the Agency plan.`);
  }
  if (limit === 'apiAccess' && !limits.apiAccess) {
    throw new PlanLimitError(limit, `API access is available on the Agency plan.`);
  }
}
