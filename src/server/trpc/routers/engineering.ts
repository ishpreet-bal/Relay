import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { recordAudit } from '@/lib/audit';
import { AGENTS } from '@/server/services/engineering/agents';
import { STAGE_LABELS, STAGES } from '@/server/services/engineering/stages';
import {
  acceptArtifact, addArtifact, addTask, advanceAsUser, artifactInputSchema, createProject, getProjectDetail,
  listProjects, projectInputSchema, setProjectStatus, taskInputSchema, taskUpdateSchema, updateTask,
} from '@/server/services/engineering/projects';
import { approvalRequestSchema, cancelApproval, decideApproval, listApprovals, requestApproval } from '@/server/services/engineering/approvals';

const id = z.string().uuid();

export const engineeringRouter = router({
  stages: permissionProcedure('studio:read').query(() => STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] }))),
  agents: permissionProcedure('studio:read').query(() => AGENTS),
  projects: permissionProcedure('studio:read').input(z.object({ clientId: id.nullish() }).default({})).query(({ ctx, input }) => listProjects(ctx.access, input.clientId)),
  project: permissionProcedure('studio:read').input(z.object({ id })).query(({ ctx, input }) => getProjectDetail(ctx.access, input.id)),

  create: permissionProcedure('studio:write').input(projectInputSchema).mutation(async ({ ctx, input }) => {
    const p = await createProject(ctx.access, ctx.session.userId, input);
    await recordAudit({ session: ctx.session, action: 'engineering.create', entityType: 'EngineeringProject', entityId: p.id, after: { name: p.name, clientId: p.clientId } });
    return p;
  }),
  advance: permissionProcedure('studio:write').input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const r = await advanceAsUser(ctx.access, input.id);
    if (r.moved) await recordAudit({ session: ctx.session, action: 'engineering.advance', entityType: 'EngineeringProject', entityId: input.id, after: { from: r.from, to: r.to, evidence: r.gate.evidence } });
    return r;
  }),
  setStatus: permissionProcedure('studio:write').input(z.object({ id, status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']), reason: z.string().trim().max(500).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const p = await setProjectStatus(ctx.access, input.id, input.status, input.reason ?? null);
      await recordAudit({ session: ctx.session, action: 'engineering.status', entityType: 'EngineeringProject', entityId: input.id, after: { status: input.status, reason: input.reason ?? null } });
      return p;
    }),

  addArtifact: permissionProcedure('studio:write').input(artifactInputSchema).mutation(({ ctx, input }) => addArtifact(ctx.access, `user:${ctx.session.userId}`, input)),
  acceptArtifact: permissionProcedure('studio:write').input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const a = await acceptArtifact(ctx.access, input.id);
    await recordAudit({ session: ctx.session, action: 'engineering.accept_document', entityType: 'ProjectArtifact', entityId: a.id, after: { kind: a.kind, version: a.version, hash: a.contentHash } });
    return a;
  }),
  addTask: permissionProcedure('studio:write').input(taskInputSchema).mutation(({ ctx, input }) => addTask(ctx.access, input)),
  updateTask: permissionProcedure('studio:write').input(taskUpdateSchema).mutation(async ({ ctx, input }) => {
    const t = await updateTask(ctx.access, input);
    await recordAudit({ session: ctx.session, action: 'engineering.task', entityType: 'EngineeringTask', entityId: t.id, after: { status: t.status, evidence: t.evidence } });
    return t;
  }),

  // Approvals are for every internal role; who may decide each kind is checked per request.
  approvals: permissionProcedure('account:read').input(z.object({ status: z.string().max(20).optional(), projectId: id.optional() }).default({}))
    .query(({ ctx, input }) => listApprovals(ctx.access, input)),
  requestApproval: permissionProcedure('studio:write').input(approvalRequestSchema).mutation(({ ctx, input }) => requestApproval(ctx.access, `user:${ctx.session.userId}`, input)),
  decide: permissionProcedure('account:read').input(z.object({ id, decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(2000).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const a = await decideApproval(ctx.access, input.id, input.decision, input.note ?? null);
      await recordAudit({ session: ctx.session, action: `approval.${input.decision.toLowerCase()}`, entityType: 'Approval', entityId: a.id, after: { kind: a.kind, note: a.decisionNote } });
      return a;
    }),
  cancelApproval: permissionProcedure('studio:write').input(z.object({ id })).mutation(({ ctx, input }) => cancelApproval(ctx.access, input.id)),
});
