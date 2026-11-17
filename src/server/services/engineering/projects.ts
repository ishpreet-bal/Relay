import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { assertClientAccess, clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { AGENT_ROLES } from './agents';
import { clearProjectAlerts } from './orchestrator';
import { ARTIFACT_KINDS, evaluateGate, isStage, nextStage, STAGES, type GateSnapshot, type Stage } from './stages';

/**
 * Engineering projects: state, documents, tasks and agent runs. Every change
 * here is checked against the caller's client scope; stage moves go through
 * the gate in stages.ts and are recorded with their evidence.
 */

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export const projectInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
  problem: z.string().trim().min(20, 'Describe the problem in a sentence or two.').max(10_000),
  deliveryProjectId: z.string().uuid().nullish(),
  opportunityId: z.string().uuid().nullish(),
  repository: z.string().trim().regex(REPO, 'owner/name, e.g. acme/invoice-automation').nullish(),
  budgetCents: z.number().int().min(0).max(10_000_000).optional(),
});

export async function loadProject(access: AccessContext, id: string) {
  const p = await db.engineeringProject.findFirst({ where: { id, organizationId: access.organizationId } });
  if (!p) throw new NotFoundError('Project');
  assertClientAccess(access, p.clientId);
  return p;
}

export async function createProject(access: AccessContext, userId: string, raw: z.input<typeof projectInputSchema>) {
  const input = projectInputSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: access.organizationId, archivedAt: null }, select: { id: true } });
  if (!client) throw new NotFoundError('Client');
  if (input.deliveryProjectId) {
    const dp = await db.deliveryProject.findFirst({ where: { id: input.deliveryProjectId, ...clientFilter(access, input.clientId) }, select: { id: true } });
    if (!dp) throw new NotFoundError('Delivery project');
  }
  if (input.opportunityId) {
    const opp = await db.opportunity.findFirst({ where: { id: input.opportunityId, ...clientFilter(access) }, select: { id: true } });
    if (!opp) throw new NotFoundError('Opportunity');
  }
  return db.$transaction(async (tx) => {
    const project = await tx.engineeringProject.create({
      data: {
        organizationId: access.organizationId, clientId: input.clientId, name: input.name, problem: input.problem,
        deliveryProjectId: input.deliveryProjectId ?? null, opportunityId: input.opportunityId ?? null,
        repository: input.repository ?? null, budgetCents: input.budgetCents ?? 5000, createdById: userId,
      },
    });
    await tx.projectStageRun.create({ data: { projectId: project.id, stage: 'INTAKE' } });
    return project;
  });
}

async function snapshot(projectId: string, problem: string): Promise<GateSnapshot> {
  const [artifacts, approvals, tasks] = await Promise.all([
    db.projectArtifact.findMany({ where: { projectId }, select: { id: true, kind: true, version: true, status: true, data: true, createdBy: true } }),
    db.approval.findMany({ where: { projectId }, select: { id: true, kind: true, status: true } }),
    db.engineeringTask.findMany({ where: { projectId }, select: { id: true, role: true, status: true, acceptanceCriteria: true, evidence: true, verifiedBy: true } }),
  ]);
  return { problem, artifacts, approvals, tasks };
}

export async function gateFor(project: { id: string; stage: string; problem: string }) {
  if (!isStage(project.stage)) throw new DomainError(`Unknown stage ${project.stage}`);
  return evaluateGate(project.stage, await snapshot(project.id, project.problem));
}

/**
 * Moves the project to the next stage if, and only if, the current gate is
 * met. `by` is "orchestrator" or "user:<id>". Returns what was checked.
 */
export async function advance(projectId: string, by: string) {
  const project = await db.engineeringProject.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status !== 'ACTIVE') return { moved: false as const, reason: `Project is ${project.status.toLowerCase()}`, gate: null };
  const gate = await gateFor(project);
  const to = nextStage(project.stage as Stage);
  if (!gate.met || !to) return { moved: false as const, reason: gate.met ? 'Final stage' : 'Gate not met', gate };
  await db.$transaction(async (tx) => {
    // Conditional on the stage we evaluated, so two advances can't skip a stage.
    const { count } = await tx.engineeringProject.updateMany({ where: { id: projectId, stage: project.stage, status: 'ACTIVE' }, data: { stage: to } });
    if (!count) throw new DomainError('The project changed while it was being advanced.');
    await tx.projectStageRun.updateMany({ where: { projectId, stage: project.stage, completedAt: null }, data: { completedAt: new Date(), completedBy: by, evidence: gate.evidence as Prisma.InputJsonValue } });
    await tx.projectStageRun.create({ data: { projectId, stage: to } });
  });
  return { moved: true as const, from: project.stage, to, gate };
}

export async function advanceAsUser(access: AccessContext, projectId: string) {
  await loadProject(access, projectId);
  return advance(projectId, `user:${access.userId}`);
}

export async function setProjectStatus(access: AccessContext, id: string, status: 'ACTIVE' | 'PAUSED' | 'CANCELLED', reason: string | null) {
  const p = await loadProject(access, id);
  if (p.status === 'CANCELLED' || p.status === 'DONE') throw new DomainError(`The project is ${p.status.toLowerCase()}.`);
  // Resuming a blocked project is a person's decision; its alerts clear with it.
  if (status === 'ACTIVE') await clearProjectAlerts(access.organizationId, id);
  return db.engineeringProject.update({ where: { id }, data: { status, blockedReason: status === 'ACTIVE' ? null : reason } });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const artifactInputSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(ARTIFACT_KINDS),
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(1).max(200_000),
  data: z.record(z.unknown()).optional(),
});

/**
 * Adds a new version of a document. `createdBy` is "user:<id>" or
 * "agent:<role>:<runId>". Every version starts as a draft.
 */
export async function addArtifact(access: AccessContext, createdBy: string, raw: z.input<typeof artifactInputSchema>) {
  const input = artifactInputSchema.parse(raw);
  await loadProject(access, input.projectId);
  const last = await db.projectArtifact.findFirst({ where: { projectId: input.projectId, kind: input.kind }, orderBy: { version: 'desc' }, select: { version: true } });
  return db.projectArtifact.create({
    data: {
      projectId: input.projectId, kind: input.kind, version: (last?.version ?? 0) + 1, title: input.title, content: input.content,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      contentHash: createHash('sha256').update(input.content).digest('hex'), createdBy,
    },
  });
}

/** A person accepts a document. Only the latest version can be accepted, and never by whoever wrote it. */
export async function acceptArtifact(access: AccessContext, artifactId: string) {
  const a = await db.projectArtifact.findUnique({ where: { id: artifactId } });
  if (!a) throw new NotFoundError('Document');
  await loadProject(access, a.projectId);
  if (a.createdBy === `user:${access.userId}`) throw new DomainError('Someone other than the author must accept this document.');
  const newer = await db.projectArtifact.count({ where: { projectId: a.projectId, kind: a.kind, version: { gt: a.version } } });
  if (newer) throw new DomainError('A newer version exists; review that one.');
  return db.projectArtifact.update({ where: { id: a.id }, data: { status: 'ACCEPTED', acceptedById: access.userId, acceptedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const taskInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(20_000),
  role: z.string().refine((r) => r === 'human' || AGENT_ROLES.includes(r), 'Unknown role'),
  acceptanceCriteria: z.array(z.string().trim().min(3).max(500)).min(1, 'Say how anyone will know it is done.').max(30),
  dependsOn: z.array(z.string().uuid()).max(30).default([]),
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';

export async function addTask(access: AccessContext, raw: z.input<typeof taskInputSchema>) {
  const input = taskInputSchema.parse(raw);
  await loadProject(access, input.projectId);
  if (input.dependsOn.length) {
    const found = await db.engineeringTask.count({ where: { id: { in: input.dependsOn }, projectId: input.projectId } });
    if (found !== new Set(input.dependsOn).size) throw new DomainError('A task can only depend on tasks in the same project.');
  }
  const task = await db.engineeringTask.create({ data: { ...input, status: input.dependsOn.length ? 'PENDING' : 'READY' } });
  // One branch per task, so parallel agents never write to the same branch.
  return db.engineeringTask.update({ where: { id: task.id }, data: { branch: `relay/${slug(input.title)}-${task.id.slice(0, 8)}` } });
}

export const taskUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED', 'CANCELLED']),
  evidence: z.record(z.string().max(2000)).optional(),
  error: z.string().max(2000).optional(),
});

/**
 * Changes a task's state. DONE needs evidence and a check by someone other
 * than its author: a person, or (later) a QA run of a different role.
 */
export async function updateTask(access: AccessContext, raw: z.input<typeof taskUpdateSchema>) {
  const input = taskUpdateSchema.parse(raw);
  const task = await db.engineeringTask.findUnique({ where: { id: input.id } });
  if (!task) throw new NotFoundError('Task');
  await loadProject(access, task.projectId);
  const evidence = input.evidence ?? (task.evidence as Record<string, string> | null) ?? undefined;
  if (input.status === 'DONE') {
    if (!evidence || !Object.values(evidence).some((v) => v.trim())) throw new DomainError('Add evidence first: a pull request, commit or test run.');
    if (task.status !== 'REVIEW') throw new DomainError('A task is checked in review before it is done.');
  }
  if (input.status === 'READY' && task.dependsOn.length) {
    const open = await db.engineeringTask.count({ where: { id: { in: task.dependsOn }, status: { not: 'DONE' } } });
    if (open) throw new DomainError('Its dependencies are not done yet.');
  }
  return db.engineeringTask.update({
    where: { id: task.id },
    data: {
      status: input.status,
      ...(evidence ? { evidence } : {}),
      ...(input.status === 'DONE' ? { verifiedBy: `user:${access.userId}` } : {}),
      ...(input.status === 'FAILED' ? { error: input.error ?? 'Failed', attempts: { increment: 1 } } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listProjects(access: AccessContext, clientId?: string | null) {
  const rows = await db.engineeringProject.findMany({ where: clientFilter(access, clientId), orderBy: { updatedAt: 'desc' }, take: 200 });
  const ids = rows.map((r) => r.id);
  const [tasks, costs, approvals, clients] = await Promise.all([
    db.engineeringTask.groupBy({ by: ['projectId', 'status'], where: { projectId: { in: ids } }, _count: true }),
    db.agentRun.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _sum: { costMillicents: true } }),
    db.approval.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, status: 'PENDING' }, _count: true }),
    db.client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true } }),
  ]);
  return rows.map((r) => {
    const t = tasks.filter((x) => x.projectId === r.id);
    const count = (s: string) => t.find((x) => x.status === s)?._count ?? 0;
    return {
      ...r,
      client: clients.find((c) => c.id === r.clientId) ?? null,
      stageIndex: STAGES.indexOf(r.stage as Stage),
      tasks: { total: t.reduce((n, x) => n + x._count, 0), done: count('DONE'), failed: count('FAILED'), running: count('RUNNING') },
      spentMillicents: costs.find((c) => c.projectId === r.id)?._sum.costMillicents ?? 0,
      pendingApprovals: approvals.find((a) => a.projectId === r.id)?._count ?? 0,
    };
  });
}

export async function getProjectDetail(access: AccessContext, id: string) {
  const project = await loadProject(access, id);
  const [client, stageRuns, artifacts, tasks, agentRuns, approvals, gate] = await Promise.all([
    db.client.findUnique({ where: { id: project.clientId }, select: { id: true, name: true } }),
    db.projectStageRun.findMany({ where: { projectId: id }, orderBy: { enteredAt: 'asc' } }),
    db.projectArtifact.findMany({ where: { projectId: id }, orderBy: [{ kind: 'asc' }, { version: 'desc' }] }),
    db.engineeringTask.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
    db.agentRun.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.approval.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
    gateFor(project),
  ]);
  const spent = agentRuns.reduce((n, r) => n + r.costMillicents, 0);
  return { project, client, stageRuns, artifacts, tasks, agentRuns, approvals, gate, spentMillicents: spent };
}
