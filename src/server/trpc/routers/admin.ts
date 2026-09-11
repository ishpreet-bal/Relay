import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import {
  pipelineSnapshot, outreachPerformance, conversionRate, revenueSummary, activeProjects,
} from '@/server/services/analytics';
import { getUsage } from '@/server/services/plan-limits';
import { createCheckoutSession, createPortalSession } from '@/server/services/billing';
import { monthlySpend } from '@/server/ai/budget';
import { recordAudit } from '@/lib/audit';

export const adminRouter = router({
  overview: permissionProcedure('lead:read')
    .input(z.object({ days: z.number().min(7).max(365).default(90) }).default({ days: 90 }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId;
      const [pipeline, outreach, conversion, revenue, aiSpend] = await Promise.all([
        pipelineSnapshot(orgId),
        outreachPerformance(orgId, input.days),
        conversionRate(orgId),
        revenueSummary(orgId),
        monthlySpend(orgId),
      ]);
      return { pipeline, outreach, conversion, revenue, aiSpend };
    }),

  projects: permissionProcedure('proposal:read').query(({ ctx }) =>
    activeProjects(ctx.session.organizationId),
  ),

  invoices: permissionProcedure('billing:manage').query(({ ctx }) =>
    ctx.db.invoice.findMany({
      where: { organizationId: ctx.session.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ),

  usage: permissionProcedure('settings:read').query(({ ctx }) => getUsage(ctx.session.organizationId)),

  /** Paginated audit trail. Read-only by design — entries are never editable. */
  auditLog: permissionProcedure('audit:read')
    .input(z.object({
      action: z.string().max(60).optional(),
      entityType: z.string().max(40).optional(),
      limit: z.number().min(10).max(200).default(50),
      cursor: z.string().uuid().optional(),
    }).default({ limit: 50 }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.auditLog.findMany({
        where: {
          organizationId: ctx.session.organizationId,
          ...(input.action ? { action: { contains: input.action } } : {}),
          ...(input.entityType ? { entityType: input.entityType } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    }),

  settings: permissionProcedure('settings:read').query(({ ctx }) =>
    ctx.db.organization.findUniqueOrThrow({
      where: { id: ctx.session.organizationId },
      select: {
        name: true, brandName: true, brandLogoUrl: true, brandPrimary: true,
        websiteUrl: true, timezone: true, currency: true,
        dayRateCents: true, discoveryFeeCents: true, supportMonthlyCents: true,
        proposalTerms: true, proposalValidDays: true,
        dailySendCap: true, hourlySendCap: true, minMinutesBetweenSends: true,
        defaultSenderName: true, offerBrief: true, toneGuidelines: true, bannedPhrases: true,
      },
    }),
  ),

  updateSettings: permissionProcedure('settings:write')
    .input(z.object({
      brandName: z.string().max(120).optional(),
      brandLogoUrl: z.string().url().max(500).nullish(),
      brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      websiteUrl: z.string().url().max(300).nullish(),
      timezone: z.string().max(60).optional(),
      currency: z.string().length(3).optional(),
      dayRateCents: z.number().int().min(0).max(1_000_000).optional(),
      discoveryFeeCents: z.number().int().min(0).max(10_000_000).optional(),
      supportMonthlyCents: z.number().int().min(0).max(10_000_000).optional(),
      proposalTerms: z.string().max(4000).nullish(),
      proposalValidDays: z.number().int().min(1).max(365).optional(),
      dailySendCap: z.number().int().min(1).max(1000).optional(),
      hourlySendCap: z.number().int().min(1).max(200).optional(),
      minMinutesBetweenSends: z.number().int().min(0).max(120).optional(),
      defaultSenderName: z.string().max(80).nullish(),
      offerBrief: z.string().max(2000).nullish(),
      toneGuidelines: z.string().max(2000).nullish(),
      bannedPhrases: z.array(z.string().max(80)).max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.organization.findUniqueOrThrow({
        where: { id: ctx.session.organizationId },
      });
      const after = await ctx.db.organization.update({
        where: { id: ctx.session.organizationId },
        data: input,
      });
      await recordAudit({
        session: ctx.session, action: 'settings.update', entityType: 'Organization',
        entityId: after.id, before, after,
      });
      return after;
    }),

  checkout: permissionProcedure('billing:manage')
    .input(z.object({ priceLookupKey: z.string().max(80), seats: z.number().int().min(1).max(100).default(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const url = await createCheckoutSession({
          organizationId: ctx.session.organizationId,
          email: ctx.session.email,
          ...input,
        });
        return { url };
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Could not start checkout.',
        });
      }
    }),

  billingPortal: permissionProcedure('billing:manage').mutation(async ({ ctx }) => ({
    url: await createPortalSession(ctx.session.organizationId, ctx.session.email),
  })),
});
