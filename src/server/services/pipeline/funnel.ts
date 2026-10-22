import { startOfMonth } from 'date-fns';
import type { PipelineStage } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';

/**
 * The three numbers the funnel keeps apart: how many companies are stored,
 * how many were discovered or refreshed this period, and how many received
 * expensive research. Plus where the stored ones sit and what research cost.
 */
export async function funnelMetrics(access: AccessContext, clientId?: string | null, now = new Date()) {
  const scope = { ...clientFilter(access, clientId), deletedAt: null };
  const since = startOfMonth(now);
  const versionScope = { ...clientFilter(access, clientId), createdAt: { gte: since } };
  const [stored, byStage, byTier, discovered, refreshed, analysed, deep, pendingScreening, dueRefresh, cost] = await Promise.all([
    db.account.count({ where: scope }),
    db.account.groupBy({ by: ['pipelineStage'], where: scope, _count: true }),
    db.account.groupBy({ by: ['opportunityTier'], where: scope, _count: true }),
    db.account.count({ where: { ...scope, createdAt: { gte: since } } }),
    db.account.count({ where: { ...scope, fingerprintedAt: { gte: since } } }),
    db.researchVersion.count({ where: { ...versionScope, stage: 'ANALYSIS' } }),
    db.researchVersion.count({ where: { ...versionScope, stage: 'DEEP' } }),
    db.account.count({ where: { ...scope, screenedAt: null } }),
    db.account.count({ where: { ...scope, nextRefreshAt: { lte: now }, websiteUrl: { not: null } } }),
    db.researchVersion.groupBy({ by: ['stage'], where: versionScope, _sum: { costMillicents: true }, _count: true }),
  ]);
  const stage = (s: PipelineStage) => byStage.find((b) => b.pipelineStage === s)?._count ?? 0;
  const costOf = (s: string) => cost.find((c) => c.stage === s);
  return {
    stored,
    thisMonth: { discovered, refreshed, analysed, deep },
    stages: {
      DISCOVERED: stage('DISCOVERED'), SCREENED_OUT: stage('SCREENED_OUT'), QUALIFIED: stage('QUALIFIED'),
      ANALYZED: stage('ANALYZED'), DEEP_RESEARCHED: stage('DEEP_RESEARCHED'),
    },
    tiers: Object.fromEntries(byTier.map((t) => [t.opportunityTier ?? 'UNSCREENED', t._count])),
    pendingScreening,
    dueRefresh,
    researchCost: {
      analysisMillicents: costOf('ANALYSIS')?._sum.costMillicents ?? 0,
      deepMillicents: costOf('DEEP')?._sum.costMillicents ?? 0,
      perAnalysisMillicents: analysed ? Math.round((costOf('ANALYSIS')?._sum.costMillicents ?? 0) / analysed) : null,
      perDeepMillicents: deep ? Math.round((costOf('DEEP')?._sum.costMillicents ?? 0) / deep) : null,
    },
  };
}
