import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { recordAudit } from '@/lib/audit';
import {
  acceptanceSchema, approveProposal, assess, buildDemo, clearOverride, convertToCustomer, createOpportunity, draftProposal, getOpportunity,
  listOpportunities, manualOpportunitySchema, markLost, OPPORTUNITY_STATUSES, overrideMatch, overrideSchema, recordAcceptance, review, syncFromResearch,
} from '@/server/services/delivery/opportunities';
import { deleteTimeEntry, getProject, listProjects, logTime, PROJECT_STATUSES, setProjectStatus, timeEntrySchema } from '@/server/services/delivery/projects';
import { env } from '@/lib/env';

const id = z.string().uuid();

/**
 * Opportunity to application. Reading follows account access; a person
 * qualifies (account:override), demos need Studio, proposals need proposal
 * rights, and creating a customer tenant needs client:manage.
 */
export const deliveryRouter = router({
  opportunities: permissionProcedure('account:read')
    .input(z.object({
      clientId: id.nullish(), accountId: id.nullish(), status: z.enum(OPPORTUNITY_STATUSES).nullish(),
      reusability: z.enum(['EXACT', 'CONFIGURATION', 'MODERATE', 'CUSTOM', 'NOT_FEASIBLE']).nullish(), cursor: id.nullish(), limit: z.number().int().min(1).max(200).default(100),
    }).default({}))
    .query(({ ctx, input }) => listOpportunities(ctx.access, input)),

  opportunity: permissionProcedure('account:read').input(z.object({ id })).query(({ ctx, input }) => getOpportunity(ctx.access, input.id)),

  syncFromResearch: permissionProcedure('account:write').input(z.object({ accountId: id })).mutation(({ ctx, input }) => syncFromResearch(ctx.access, input.accountId)),

  create: permissionProcedure('account:write').input(manualOpportunitySchema).mutation(({ ctx, input }) => createOpportunity(ctx.access, ctx.session.userId, input)),

  overrideMatch: permissionProcedure('account:write')
    .input(overrideSchema.extend({ id }))
    .mutation(async ({ ctx, input }) => {
      const { id: oppId, ...rest } = input;
      const res = await overrideMatch(ctx.access, ctx.session.userId, oppId, rest);
      await recordAudit({ session: ctx.session, action: 'opportunity.override', entityType: 'Opportunity', entityId: oppId, after: rest });
      return res;
    }),

  clearOverride: permissionProcedure('account:write').input(z.object({ id })).mutation(({ ctx, input }) => clearOverride(ctx.access, input.id)),

  assess: permissionProcedure('account:write').input(z.object({ id, assessment: z.unknown() })).mutation(({ ctx, input }) => assess(ctx.access, input.id, input.assessment)),

  review: permissionProcedure('account:override')
    .input(z.object({ id, decision: z.enum(['QUALIFIED', 'REJECTED']), note: z.string().trim().max(1000).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const res = await review(ctx.access, ctx.session.userId, input.id, input.decision, input.note ?? null);
      await recordAudit({ session: ctx.session, action: 'opportunity.review', entityType: 'Opportunity', entityId: input.id, after: { decision: input.decision, note: input.note } });
      return res;
    }),

  markLost: permissionProcedure('account:write').input(z.object({ id, note: z.string().trim().min(3).max(1000) })).mutation(({ ctx, input }) => markLost(ctx.access, ctx.session.userId, input.id, input.note)),

  buildDemo: permissionProcedure('studio:write').input(z.object({ id })).mutation(({ ctx, input }) => buildDemo(ctx.access, ctx.session.userId, input.id)),

  draftProposal: permissionProcedure('proposal:write').input(z.object({ id })).mutation(({ ctx, input }) => draftProposal(ctx.access, ctx.session.userId, input.id)),

  approveProposal: permissionProcedure('proposal:send')
    .input(z.object({ proposalId: id }))
    .mutation(async ({ ctx, input }) => {
      const p = await approveProposal(ctx.access, ctx.session.userId, input.proposalId);
      await recordAudit({ session: ctx.session, action: 'proposal.approve', entityType: 'Proposal', entityId: p.id });
      return { ...p, shareUrl: `${env().APP_URL}/p/${p.shareToken}` };
    }),

  recordAcceptance: permissionProcedure('proposal:send')
    .input(acceptanceSchema.extend({ proposalId: id }))
    .mutation(async ({ ctx, input }) => {
      const { proposalId, ...rest } = input;
      const p = await recordAcceptance(ctx.access, ctx.session.userId, proposalId, rest);
      await recordAudit({ session: ctx.session, action: 'proposal.accept_recorded', entityType: 'Proposal', entityId: proposalId, after: rest });
      return p;
    }),

  convert: permissionProcedure('client:manage')
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      const res = await convertToCustomer(ctx.access, ctx.session.userId, input.id);
      await recordAudit({ session: ctx.session, action: 'opportunity.convert', entityType: 'Opportunity', entityId: input.id, after: res });
      return res;
    }),

  projects: permissionProcedure('proposal:read').input(z.object({ clientId: id.nullish() }).default({})).query(({ ctx, input }) => listProjects(ctx.access, input.clientId)),

  project: permissionProcedure('proposal:read').input(z.object({ id })).query(({ ctx, input }) => getProject(ctx.access, input.id)),

  logTime: permissionProcedure('studio:write').input(timeEntrySchema).mutation(({ ctx, input }) => logTime(ctx.access, ctx.session.userId, input)),

  deleteTime: permissionProcedure('studio:write').input(z.object({ id })).mutation(({ ctx, input }) => deleteTimeEntry(ctx.access, input.id)),

  setProjectStatus: permissionProcedure('studio:write')
    .input(z.object({ id, status: z.enum(PROJECT_STATUSES) }))
    .mutation(({ ctx, input }) => setProjectStatus(ctx.access, input.id, input.status)),
});
