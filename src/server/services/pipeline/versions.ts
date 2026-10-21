import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Research history. Each completed analysis is kept as an immutable version,
 * with its findings split by how far they can be trusted:
 *   facts       — verified: a quote located on an accessible page;
 *   hypotheses  — AI inferences, labelled as such, needing validation;
 *   unknowns    — what can't be established from outside the company.
 * The current Research row is the latest; versions keep what came before.
 */

export function fingerprint(text: string | null | undefined) {
  return createHash('sha256').update(text ?? '').digest('hex').slice(0, 32);
}

interface Fact { id?: string; statement?: string; claimType?: string }
interface Angle { angle?: string; reasoning?: string; confidence?: number }
interface Attribute { attribute?: string; assessment?: string; reasoning?: string }

function statements(v: unknown, key: 'statement' | 'angle'): string[] {
  return Array.isArray(v) ? v.map((x) => String((x as Record<string, unknown>)[key] ?? '')).filter(Boolean).sort() : [];
}

/** Snapshots the account's completed analysis as the next version. */
export async function snapshotAnalysis(accountId: string, trigger: string) {
  const research = await db.research.findUnique({ where: { accountId } });
  if (!research || research.status !== 'COMPLETED') return null;
  const previous = await db.researchVersion.findFirst({ where: { accountId, stage: 'ANALYSIS' }, orderBy: { version: 'desc' } });

  const relevance = (research.relevance ?? {}) as { angles?: Angle[]; attributes?: Attribute[] };
  const facts = (research.facts ?? []) as Fact[];
  const hypotheses = (relevance.angles ?? []).map((a) => ({ ...a, kind: 'AI_HYPOTHESIS' }));
  const unknowns = (relevance.attributes ?? []).filter((a) => a.assessment === 'UNKNOWN').map((a) => ({ question: a.attribute, why: a.reasoning ?? null }));
  const print = fingerprint(research.rawExtract);

  const changed: string[] = [];
  if (previous) {
    if (previous.contentFingerprint !== print) changed.push('website content');
    if ((previous.summary ?? '') !== (research.companySummary ?? '')) changed.push('summary');
    if (JSON.stringify(statements(previous.facts, 'statement')) !== JSON.stringify(statements(facts, 'statement'))) changed.push('facts');
    if (JSON.stringify(statements(previous.hypotheses, 'angle')) !== JSON.stringify(statements(hypotheses, 'angle'))) changed.push('hypotheses');
  }

  return db.researchVersion.create({
    data: {
      organizationId: research.organizationId,
      clientId: research.clientId,
      accountId,
      version: (previous?.version ?? 0) + 1,
      stage: 'ANALYSIS',
      trigger,
      summary: research.companySummary,
      facts: facts as unknown as Prisma.InputJsonValue,
      hypotheses: hypotheses as unknown as Prisma.InputJsonValue,
      unknowns: unknowns as unknown as Prisma.InputJsonValue,
      sources: (research.pagesCrawled ?? []) as Prisma.InputJsonValue,
      model: research.model,
      promptVersion: research.promptVersion,
      contentFingerprint: print,
      changedFields: changed,
      costMillicents: (research.costCents ?? 0) * 1000,
    },
  });
}

export function listVersions(accountId: string) {
  return db.researchVersion.findMany({ where: { accountId }, orderBy: [{ createdAt: 'desc' }], take: 50 });
}
