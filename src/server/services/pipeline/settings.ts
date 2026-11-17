import { z } from 'zod';
import { db } from '@/lib/db';

/** A workspace's research-funnel settings, created with defaults on first read. */
export async function getPipelineSettings(organizationId: string) {
  return (await db.pipelineSettings.findUnique({ where: { organizationId } }))
    ?? db.pipelineSettings.create({ data: { organizationId } });
}

const cents = z.number().int().min(0).max(100_000_000).nullable();
const days = z.number().int().min(1).max(730);

export const pipelineSettingsSchema = z.object({
  screeningThreshold: z.number().int().min(0).max(100),
  deepThreshold: z.number().int().min(0).max(100),
  autoScreen: z.boolean(),
  autoAnalyze: z.boolean(),
  autoDeep: z.boolean(),
  maxAnalysesPerDay: z.number().int().min(0).max(10_000),
  maxDeepPerDay: z.number().int().min(0).max(1_000),
  autoContacts: z.boolean(),
  maxContactLookupsPerDay: z.number().int().min(0).max(5_000),
  refreshDaysHot: days,
  refreshDaysWarm: days,
  refreshDaysExploratory: days,
  refreshDaysLow: days,
  refreshDaysScreenedOut: days,
  globalBudgetCents: cents,
  discoveryBudgetCents: cents,
  analysisBudgetCents: cents,
  deepBudgetCents: cents,
  enrichmentBudgetCents: cents,
  outreachBudgetCents: cents,
}).partial();

export async function updatePipelineSettings(organizationId: string, userId: string, raw: z.input<typeof pipelineSettingsSchema>) {
  const data = pipelineSettingsSchema.parse(raw);
  return db.pipelineSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data, updatedById: userId },
    update: { ...data, updatedById: userId },
  });
}
