import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { Permission } from '@/lib/rbac';
import { accessCan, assertClientAccess, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { ForbiddenError } from '@/lib/rbac';

/**
 * One inbox for consequential actions. Agents and people prepare them; only
 * someone with the matching permission decides, never the one who asked,
 * and nothing runs until it is approved.
 */

export const APPROVAL_KINDS = {
  SCOPE: { label: 'Scope and price', permission: 'proposal:send' },
  ACCEPTANCE: { label: 'Customer acceptance', permission: 'proposal:send' },
  PRODUCTION_DEPLOY: { label: 'Production deployment', permission: 'studio:deploy' },
  PRODUCTION_DATA: { label: 'Production data change', permission: 'studio:deploy' },
  CUSTOMER_SYSTEM_ACCESS: { label: 'Access to a customer system', permission: 'studio:secrets' },
  CUSTOMER_EMAIL: { label: 'Email to a customer', permission: 'message:approve' },
  PURCHASE: { label: 'Purchase', permission: 'billing:manage' },
  DNS_CHANGE: { label: 'DNS change', permission: 'billing:manage' },
  CHARGE: { label: 'Charge a customer', permission: 'billing:manage' },
  IRREVERSIBLE: { label: 'Irreversible change', permission: 'billing:manage' },
} as const satisfies Record<string, { label: string; permission: Permission }>;
export type ApprovalKind = keyof typeof APPROVAL_KINDS;
export const APPROVAL_KIND_KEYS = Object.keys(APPROVAL_KINDS) as [ApprovalKind, ...ApprovalKind[]];

export const approvalRequestSchema = z.object({
  kind: z.enum(APPROVAL_KIND_KEYS),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(5000),
  payload: z.record(z.unknown()).optional(),
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

/** Records a request. `requestedBy` is "user:<id>" or "agent:<runId>". */
export async function requestApproval(access: AccessContext, requestedBy: string, raw: z.input<typeof approvalRequestSchema>) {
  const input = approvalRequestSchema.parse(raw);
  let clientId = input.clientId ?? null;
  if (input.projectId) {
    const project = await db.engineeringProject.findFirst({ where: { id: input.projectId, organizationId: access.organizationId }, select: { clientId: true } });
    if (!project) throw new NotFoundError('Project');
    clientId = project.clientId;
  }
  if (clientId) assertClientAccess(access, clientId);
  return db.approval.create({
    data: {
      organizationId: access.organizationId, clientId, projectId: input.projectId ?? null,
      kind: input.kind, title: input.title, summary: input.summary,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      requestedBy,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000) : null,
    },
  });
}

/** Pending approvals the caller may see, newest first. */
export async function listApprovals(access: AccessContext, opts: { status?: string; projectId?: string } = {}) {
  await expireOld(access.organizationId);
  const scope = access.clients.kind === 'all' ? {} : { OR: [{ clientId: { in: [...access.clients.ids] } }] };
  const rows = await db.approval.findMany({
    where: { organizationId: access.organizationId, ...(opts.status ? { status: opts.status } : {}), ...(opts.projectId ? { projectId: opts.projectId } : {}), ...scope },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((a) => ({ ...a, kindLabel: APPROVAL_KINDS[a.kind as ApprovalKind]?.label ?? a.kind, canDecide: canDecide(access, a) }));
}

function canDecide(access: AccessContext, a: { kind: string; requestedBy: string; status: string }) {
  const kind = APPROVAL_KINDS[a.kind as ApprovalKind];
  return a.status === 'PENDING' && !!kind && accessCan(access, kind.permission) && a.requestedBy !== `user:${access.userId}`;
}

export async function decideApproval(access: AccessContext, id: string, decision: 'APPROVED' | 'REJECTED', note: string | null) {
  await expireOld(access.organizationId);
  const a = await db.approval.findFirst({ where: { id, organizationId: access.organizationId } });
  if (!a) throw new NotFoundError('Approval');
  if (a.clientId) assertClientAccess(access, a.clientId);
  if (a.status !== 'PENDING') throw new DomainError(`This request is already ${a.status.toLowerCase()}.`);
  const kind = APPROVAL_KINDS[a.kind as ApprovalKind];
  if (!kind || !accessCan(access, kind.permission)) throw new ForbiddenError(kind?.permission ?? a.kind);
  if (a.requestedBy === `user:${access.userId}`) throw new DomainError('Someone other than the person who asked must decide this.');
  if (decision === 'REJECTED' && !note?.trim()) throw new DomainError('Say why it was rejected, so it can be fixed.');
  // Conditional update: two people deciding at once can't both win.
  const { count } = await db.approval.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: decision, decidedById: access.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
  });
  if (!count) throw new DomainError('Someone decided this a moment ago.');
  return db.approval.findUniqueOrThrow({ where: { id } });
}

export async function cancelApproval(access: AccessContext, id: string) {
  const a = await db.approval.findFirst({ where: { id, organizationId: access.organizationId, status: 'PENDING' } });
  if (!a) throw new NotFoundError('Approval');
  if (a.clientId) assertClientAccess(access, a.clientId);
  return db.approval.update({ where: { id }, data: { status: 'CANCELLED', decidedById: access.userId, decidedAt: new Date() } });
}

async function expireOld(organizationId: string) {
  await db.approval.updateMany({ where: { organizationId, status: 'PENDING', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
}

export async function pendingApprovalCount(access: AccessContext) {
  const rows = await listApprovals(access, { status: 'PENDING' });
  return rows.filter((r) => r.canDecide).length;
}
