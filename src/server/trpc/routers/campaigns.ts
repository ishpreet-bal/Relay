import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import {
  activationProblems, campaignInputSchema, campaignStepSchema, createCampaign, DEFAULT_STEPS, enrollAccounts, enrollContacts,
  exitEnrollment, findCampaign, replaceSteps, setCampaignStatus, stepsFromPlaybook, updateCampaign,
} from '@/server/services/campaigns';
import { clientFilter } from '@/server/access/scope';
import { findPlaybook } from '@/server/services/playbooks';
import { recordAudit } from '@/lib/audit';

export const campaignsRouter = router({
  defaultSteps: permissionProcedure('campaign:read').query(() => DEFAULT_STEPS),

  /** Steps a playbook would give a new campaign. */
  playbookSteps: permissionProcedure('campaign:read')
    .input(z.object({ playbookId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const playbook = await findPlaybook(ctx.access, input.playbookId);
      const steps = stepsFromPlaybook(playbook.sequenceTemplate);
      return {
        steps: steps.length ? steps : DEFAULT_STEPS,
        approvedClaimTypes: playbook.approvedClaimTypes,
        autoApproveThreshold: playbook.autoApproveThreshold,
      };
    }),

  mailboxes: permissionProcedure('campaign:read').query(({ ctx }) =>
    ctx.db.mailbox.findMany({
      where: { organizationId: ctx.access.organizationId, isActive: true },
      select: { id: true, fromName: true, fromEmail: true, spfVerified: true, dkimVerified: true, dailyCap: true },
      orderBy: { createdAt: 'asc' },
    }),
  ),

  list: permissionProcedure('campaign:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) =>
      ctx.db.campaign.findMany({
        where: { ...clientFilter(ctx.access, input.clientId), status: { not: 'ARCHIVED' } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          steps: { orderBy: { order: 'asc' } },
          client: { select: { id: true, name: true } },
          offer: { select: { name: true, summary: true } },
          icp: { select: { name: true } },
          playbook: { select: { name: true } },
          mailbox: { select: { fromEmail: true, spfVerified: true, dkimVerified: true } },
          _count: { select: { enrollments: true } },
        },
      }),
    ),

  byId: permissionProcedure('campaign:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await findCampaign(ctx.access, input.id);
      const campaign = await ctx.db.campaign.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          steps: { orderBy: { order: 'asc' } },
          mailbox: true,
          client: { select: { id: true, name: true, timezone: true } },
          offer: true,
          icp: true,
          playbook: { select: { id: true, name: true } },
          _count: { select: { enrollments: true } },
        },
      });
      return { ...campaign, activationProblems: await activationProblems(campaign) };
    }),

  stats: permissionProcedure('campaign:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await findCampaign(ctx.access, input.id);
      const [messages, enrollments, replies, meetings, calls] = await Promise.all([
        ctx.db.message.groupBy({ by: ['status'], where: { campaignId: input.id, direction: 'OUTBOUND' }, _count: true }),
        ctx.db.campaignEnrollment.groupBy({ by: ['status'], where: { campaignId: input.id }, _count: true }),
        ctx.db.message.groupBy({ by: ['replyClass'], where: { campaignId: input.id, direction: 'INBOUND' }, _count: true }),
        ctx.db.meeting.count({ where: { campaignId: input.id, status: { not: 'CANCELLED' } } }),
        ctx.db.call.count({ where: { campaignId: input.id } }),
      ]);
      const autoApproved = await ctx.db.message.count({ where: { campaignId: input.id, approvalSource: 'POLICY' } });
      const count = (statuses: string[]) => messages.filter((m) => statuses.includes(m.status)).reduce((n, m) => n + m._count, 0);
      const sent = count(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED']);
      const replyCount = (classes: Array<string | null>) => replies.filter((r) => classes.includes(r.replyClass)).reduce((n, r) => n + r._count, 0);
      const realReplies = replies.filter((r) => r.replyClass !== 'OUT_OF_OFFICE').reduce((n, r) => n + r._count, 0);
      return {
        inReview: count(['DRAFT', 'NEEDS_EDIT']),
        approved: count(['APPROVED', 'SCHEDULED']),
        autoApproved,
        sent,
        bounced: count(['BOUNCED']),
        replies: realReplies,
        positiveReplies: replyCount(['POSITIVE', 'REFERRAL']),
        negativeReplies: replyCount(['NEGATIVE', 'UNSUBSCRIBE']),
        calls,
        meetings,
        bounceRate: sent ? count(['BOUNCED']) / sent : 0,
        replyRate: sent ? realReplies / sent : 0,
        enrollments: enrollments.map((e) => ({ status: e.status, count: e._count })),
      };
    }),

  create: permissionProcedure('campaign:write')
    .input(campaignInputSchema)
    .mutation(async ({ ctx, input }) => {
      const campaign = await createCampaign(ctx.access, input);
      await recordAudit({ session: ctx.session, action: 'campaign.create', entityType: 'Campaign', entityId: campaign.id, after: { name: campaign.name, steps: campaign.steps.length } });
      return campaign;
    }),

  update: permissionProcedure('campaign:write')
    .input(z.object({ id: z.string().uuid(), data: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const before = await findCampaign(ctx.access, input.id);
      const after = await updateCampaign(ctx.access, input.id, input.data);
      // Turning on automatic sending changes what leaves without review; it is always audited.
      await recordAudit({
        session: ctx.session, action: before.approvalMode !== after.approvalMode ? 'campaign.approval_mode' : 'campaign.update',
        entityType: 'Campaign', entityId: input.id,
        before: { approvalMode: before.approvalMode, threshold: before.autoApproveThreshold, claimTypes: before.approvedClaimTypes },
        after: { approvalMode: after.approvalMode, threshold: after.autoApproveThreshold, claimTypes: after.approvedClaimTypes },
      });
      return after;
    }),

  replaceSteps: permissionProcedure('campaign:write')
    .input(z.object({ id: z.string().uuid(), steps: z.array(campaignStepSchema).min(1).max(8) }))
    .mutation(({ ctx, input }) => replaceSteps(ctx.access, input.id, input.steps)),

  enrollAccounts: permissionProcedure('campaign:write')
    .input(z.object({ campaignId: z.string().uuid(), accountIds: z.array(z.string().uuid()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const result = await enrollAccounts(ctx.access, input.campaignId, input.accountIds);
      await recordAudit({ session: ctx.session, action: 'campaign.enroll', entityType: 'Campaign', entityId: input.campaignId, after: { enrolled: result.enrolled, skipped: result.skipped.length } });
      return result;
    }),

  enrollContacts: permissionProcedure('campaign:write')
    .input(z.object({ campaignId: z.string().uuid(), contactIds: z.array(z.string().uuid()).min(1).max(500) }))
    .mutation(({ ctx, input }) => enrollContacts(ctx.access, input.campaignId, input.contactIds)),

  setStatus: permissionProcedure('campaign:activate')
    .input(z.object({ id: z.string().uuid(), status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']) }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await setCampaignStatus(ctx.access, input.id, input.status);
      await recordAudit({ session: ctx.session, action: `campaign.${input.status.toLowerCase()}`, entityType: 'Campaign', entityId: input.id, after: { status: input.status } });
      return campaign;
    }),

  removeContact: permissionProcedure('campaign:write')
    .input(z.object({ contactId: z.string().uuid(), reason: z.string().max(300).optional() }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.contact.count({ where: { id: input.contactId, ...clientFilter(ctx.access) } });
      if (!owned) return { exited: 0 };
      return exitEnrollment({ contactId: input.contactId, reason: 'REMOVED', note: input.reason });
    }),

  enrollments: permissionProcedure('campaign:read')
    .input(z.object({ campaignId: z.string().uuid(), limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      await findCampaign(ctx.access, input.campaignId);
      return ctx.db.campaignEnrollment.findMany({
        where: { campaignId: input.campaignId },
        orderBy: [{ status: 'asc' }, { nextActionAt: 'asc' }],
        take: input.limit,
        include: {
          account: { select: { id: true, name: true, score: true, status: true } },
          contact: { select: { id: true, firstName: true, lastName: true, title: true, score: true } },
        },
      });
    }),
});
