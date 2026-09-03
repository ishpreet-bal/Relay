import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import {
  createCampaign, enrollLeads, setCampaignStatus, exitEnrollment,
  campaignInputSchema, campaignStepSchema, DEFAULT_STEPS,
} from '@/server/services/campaigns';
import { recordAudit } from '@/lib/audit';

export const campaignsRouter = router({
  defaultSteps: permissionProcedure('campaign:read').query(() => DEFAULT_STEPS),

  /** Sending identities available to a campaign, with their auth status. */
  mailboxes: permissionProcedure('campaign:read').query(({ ctx }) =>
    ctx.db.mailbox.findMany({
      where: { organizationId: ctx.session.organizationId, isActive: true },
      select: { id: true, fromName: true, fromEmail: true, spfVerified: true, dkimVerified: true, dailyCap: true },
      orderBy: { createdAt: 'asc' },
    }),
  ),

  list: permissionProcedure('campaign:read').query(({ ctx }) =>
    ctx.db.campaign.findMany({
      where: { organizationId: ctx.session.organizationId, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      include: {
        steps: { orderBy: { order: 'asc' } },
        mailbox: { select: { fromEmail: true, spfVerified: true, dkimVerified: true } },
        _count: { select: { enrollments: true, messages: true } },
      },
    }),
  ),

  byId: permissionProcedure('campaign:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.db.campaign.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
        include: {
          steps: { orderBy: { order: 'asc' } },
          mailbox: true,
          _count: { select: { enrollments: true } },
        },
      });
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
      return campaign;
    }),

  /** Funnel counts for the campaign detail view. */
  stats: permissionProcedure('campaign:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [messages, enrollments] = await Promise.all([
        ctx.db.message.groupBy({
          by: ['status'],
          where: { campaignId: input.id, organizationId: ctx.session.organizationId, direction: 'OUTBOUND' },
          _count: true,
        }),
        ctx.db.campaignEnrollment.groupBy({
          by: ['status'],
          where: { campaignId: input.id, organizationId: ctx.session.organizationId },
          _count: true,
        }),
      ]);

      const count = (statuses: string[]) =>
        messages.filter((m) => statuses.includes(m.status)).reduce((n, m) => n + m._count, 0);

      const sent = count(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED']);
      const delivered = count(['DELIVERED', 'OPENED', 'CLICKED', 'REPLIED']);

      return {
        prepared: count(['DRAFT', 'NEEDS_EDIT']),
        approved: count(['APPROVED', 'SCHEDULED']),
        sent,
        delivered,
        opened: count(['OPENED', 'CLICKED', 'REPLIED']),
        clicked: count(['CLICKED']),
        replied: count(['REPLIED']),
        bounced: count(['BOUNCED']),
        complained: count(['COMPLAINED']),
        bounceRate: sent ? count(['BOUNCED']) / sent : 0,
        replyRate: delivered ? count(['REPLIED']) / delivered : 0,
        enrollments: enrollments.map((e) => ({ status: e.status, count: e._count })),
      };
    }),

  create: permissionProcedure('campaign:write')
    .input(campaignInputSchema)
    .mutation(async ({ ctx, input }) => {
      const campaign = await createCampaign(ctx.session.organizationId, input);
      await recordAudit({
        session: ctx.session, action: 'campaign.create', entityType: 'Campaign',
        entityId: campaign.id, after: { name: campaign.name, steps: campaign.steps.length },
      });
      return campaign;
    }),

  update: permissionProcedure('campaign:write')
    .input(z.object({ id: z.string().uuid(), data: campaignInputSchema.partial().omit({ steps: true }) }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.campaign.count({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.campaign.update({ where: { id: input.id }, data: input.data });
    }),

  replaceSteps: permissionProcedure('campaign:write')
    .input(z.object({ id: z.string().uuid(), steps: z.array(campaignStepSchema).min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.db.campaign.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
      if (campaign.status === 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pause the campaign before changing its steps — people are mid-sequence.',
        });
      }
      return ctx.db.$transaction(async (tx) => {
        await tx.campaignStep.deleteMany({ where: { campaignId: input.id } });
        return tx.campaign.update({
          where: { id: input.id },
          data: { steps: { create: input.steps } },
          include: { steps: { orderBy: { order: 'asc' } } },
        });
      });
    }),

  enroll: permissionProcedure('campaign:write')
    .input(z.object({ campaignId: z.string().uuid(), leadIds: z.array(z.string().uuid()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const result = await enrollLeads(ctx.session.organizationId, input.campaignId, input.leadIds);
      await recordAudit({
        session: ctx.session, action: 'campaign.enroll', entityType: 'Campaign',
        entityId: input.campaignId, after: result,
      });
      return result;
    }),

  setStatus: permissionProcedure('campaign:activate')
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Activating a campaign with an unauthenticated sending domain is the
      // single fastest way to burn a domain, so it's blocked here rather than
      // discovered later in the gate.
      if (input.status === 'ACTIVE') {
        const campaign = await ctx.db.campaign.findFirst({
          where: { id: input.id, organizationId: ctx.session.organizationId },
          include: { mailbox: true, steps: true },
        });
        if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' });
        if (!campaign.steps.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one step first.' });
        }
        if (!campaign.mailbox) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a sending mailbox first.' });
        }
        if (!campaign.mailbox.spfVerified || !campaign.mailbox.dkimVerified) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `SPF and DKIM aren't verified for ${campaign.mailbox.fromEmail}. Sending before they are will hurt deliverability for every future email.`,
          });
        }
      }

      const campaign = await setCampaignStatus(ctx.session.organizationId, input.id, input.status);
      await recordAudit({
        session: ctx.session, action: `campaign.${input.status.toLowerCase()}`,
        entityType: 'Campaign', entityId: input.id, after: { status: input.status },
      });
      return campaign;
    }),

  removeLead: permissionProcedure('campaign:write')
    .input(z.object({ leadId: z.string().uuid(), reason: z.string().max(300).optional() }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.lead.count({
        where: { id: input.leadId, organizationId: ctx.session.organizationId },
      });
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND' });
      return exitEnrollment({ leadId: input.leadId, reason: 'REMOVED', note: input.reason });
    }),

  enrollments: permissionProcedure('campaign:read')
    .input(z.object({ campaignId: z.string().uuid(), limit: z.number().min(1).max(200).default(50) }))
    .query(({ ctx, input }) =>
      ctx.db.campaignEnrollment.findMany({
        where: { campaignId: input.campaignId, organizationId: ctx.session.organizationId },
        orderBy: [{ status: 'asc' }, { nextActionAt: 'asc' }],
        take: input.limit,
        include: { lead: { select: { id: true, companyName: true, score: true, status: true } } },
      }),
    ),
});
