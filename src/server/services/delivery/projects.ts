import { z } from 'zod';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';

/**
 * Delivery projects: what was estimated against what it actually took.
 * Closed projects calibrate the next estimate on the same template
 * (see matching.estimateEffort), so estimates improve with real data.
 */

export const PROJECT_STATUSES = ['PLANNED', 'BUILDING', 'TESTING', 'LIVE', 'CLOSED'] as const;
export const TIME_CATEGORIES = ['discovery', 'build', 'configuration', 'testing', 'meetings', 'support'] as const;

async function loadProject(access: AccessContext, id: string) {
  const p = await db.deliveryProject.findFirst({ where: { id, ...clientFilter(access) } });
  if (!p) throw new NotFoundError('Project');
  return p;
}

export function variance(estimatedHours: number, actualMinutes: number) {
  const actualHours = Math.round((actualMinutes / 60) * 10) / 10;
  return {
    actualHours,
    varianceHours: Math.round((actualHours - estimatedHours) * 10) / 10,
    ratio: estimatedHours > 0 ? Math.round((actualHours / estimatedHours) * 100) / 100 : null,
  };
}

export async function listProjects(access: AccessContext, clientId?: string | null) {
  const rows = await db.deliveryProject.findMany({
    where: clientFilter(access, clientId),
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  const minutes = await db.projectTimeEntry.groupBy({ by: ['projectId'], where: { projectId: { in: rows.map((r) => r.id) } }, _sum: { minutes: true } });
  const clients = await db.client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true } });
  return rows.map((r) => ({
    ...r,
    client: clients.find((c) => c.id === r.clientId) ?? null,
    ...variance(r.estimatedHours, minutes.find((m) => m.projectId === r.id)?._sum.minutes ?? 0),
  }));
}

export async function getProject(access: AccessContext, id: string) {
  const p = await loadProject(access, id);
  const [entries, byCategory, client, org] = await Promise.all([
    db.projectTimeEntry.findMany({ where: { projectId: id }, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }], take: 200 }),
    db.projectTimeEntry.groupBy({ by: ['category'], where: { projectId: id }, _sum: { minutes: true } }),
    db.client.findUnique({ where: { id: p.clientId }, select: { id: true, name: true } }),
    db.organization.findUniqueOrThrow({ where: { id: p.organizationId }, select: { internalHourlyCostCents: true } }),
  ]);
  const total = byCategory.reduce((n, c) => n + (c._sum.minutes ?? 0), 0);
  return {
    project: p, client, entries,
    byCategory: byCategory.map((c) => ({ category: c.category, hours: Math.round(((c._sum.minutes ?? 0) / 60) * 10) / 10 })),
    actualCostCents: Math.round((total / 60) * org.internalHourlyCostCents),
    ...variance(p.estimatedHours, total),
  };
}

export const timeEntrySchema = z.object({
  projectId: z.string().uuid(),
  category: z.enum(TIME_CATEGORIES),
  minutes: z.number().int().min(5).max(16 * 60),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
});

export async function logTime(access: AccessContext, userId: string, raw: z.input<typeof timeEntrySchema>) {
  const input = timeEntrySchema.parse(raw);
  const p = await loadProject(access, input.projectId);
  if (p.status === 'CLOSED') throw new DomainError('The project is closed.');
  const entry = await db.projectTimeEntry.create({ data: { projectId: p.id, userId, category: input.category, minutes: input.minutes, workDate: new Date(`${input.workDate}T00:00:00Z`), note: input.note ?? null } });
  if (p.status === 'PLANNED') await db.deliveryProject.update({ where: { id: p.id }, data: { status: 'BUILDING', startedAt: p.startedAt ?? new Date() } });
  return entry;
}

export async function deleteTimeEntry(access: AccessContext, entryId: string) {
  const entry = await db.projectTimeEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new NotFoundError('Time entry');
  const p = await loadProject(access, entry.projectId);
  if (p.status === 'CLOSED') throw new DomainError('The project is closed.');
  await db.projectTimeEntry.delete({ where: { id: entryId } });
  return { ok: true };
}

export async function setProjectStatus(access: AccessContext, id: string, status: (typeof PROJECT_STATUSES)[number]) {
  const p = await loadProject(access, id);
  if (p.status === 'CLOSED') throw new DomainError('A closed project stays closed; its hours calibrate future estimates.');
  const now = new Date();
  return db.deliveryProject.update({
    where: { id: p.id },
    data: { status, ...(status !== 'PLANNED' && !p.startedAt ? { startedAt: now } : {}), ...(status === 'LIVE' && !p.liveAt ? { liveAt: now } : {}), ...(status === 'CLOSED' ? { closedAt: now } : {}) },
  });
}
