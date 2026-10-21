import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import { buildProposal } from '@/server/services/proposal';
import { createPortfolioSite, publishSite } from '@/server/services/portfolio';
import { recordAudit } from '@/lib/audit';
import { logActivity } from '@/server/services/activity';
import { env } from '@/lib/env';

export const proposalsRouter = router({
  list: permissionProcedure('proposal:read').query(({ ctx }) =>
    ctx.db.proposal.findMany({
      where: { organizationId: ctx.access.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { account: { select: { id: true, name: true } } },
    }),
  ),

  byAccount: permissionProcedure('proposal:read')
    .input(z.object({ accountId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.db.proposal.findMany({
        where: { accountId: input.accountId, organizationId: ctx.access.organizationId },
        orderBy: { createdAt: 'desc' },
      }),
    ),

  generate: permissionProcedure('proposal:write')
    .input(z.object({
      accountId: z.string().uuid(),
      title: z.string().max(160).optional(),
      includeOpportunities: z.array(z.number().int().min(0)).optional(),
      overrides: z.object({
        dayRateCents: z.number().int().min(0).max(10_000_00).optional(),
        discoveryFeeCents: z.number().int().min(0).max(100_000_00).optional(),
        supportMonthlyCents: z.number().int().min(0).max(100_000_00).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const proposal = await buildProposal({
          organizationId: ctx.access.organizationId,
          userId: ctx.session.userId,
          ...input,
        });
        await recordAudit({
          session: ctx.session, action: 'proposal.create', entityType: 'Proposal',
          entityId: proposal.id, after: { number: proposal.number, total: proposal.totalCents },
        });
        return proposal;
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Could not build the proposal.',
        });
      }
    }),

  /** Marks a proposal as sent and returns the shareable link. */
  markSent: permissionProcedure('proposal:send')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.proposal.findFirst({
        where: { id: input.id, organizationId: ctx.access.organizationId },
      });
      if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.db.proposal.update({
        where: { id: input.id },
        data: { status: 'SENT' },
      });
      await logActivity({
        organizationId: ctx.access.organizationId, accountId: proposal.accountId,
        userId: ctx.session.userId, type: 'PROPOSAL_SENT',
        title: `Proposal ${proposal.number} sent`,
      });

      return { proposal: updated, url: `${env().APP_URL}/p/${proposal.shareToken}` };
    }),

  // --- Portfolio microsites ---

  sites: permissionProcedure('portfolio:read').query(({ ctx }) =>
    ctx.db.portfolioSite.findMany({
      where: { organizationId: ctx.access.organizationId },
      orderBy: { createdAt: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    }),
  ),

  createSite: permissionProcedure('portfolio:write')
    .input(z.object({
      accountId: z.string().uuid(),
      templateSlug: z.string().max(80).optional(),
      expiresInDays: z.number().int().min(7).max(365).optional(),
      logoUrl: z.string().url().max(500).optional(),
      /** Required alongside a logo — records who granted permission and when. */
      logoConsentNote: z.string().max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.logoUrl && !input.logoConsentNote) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Record who gave permission to use their logo before adding one.',
        });
      }
      const site = await createPortfolioSite({
        organizationId: ctx.access.organizationId,
        userId: ctx.session.userId,
        ...input,
      });
      await recordAudit({
        session: ctx.session, action: 'portfolio.create', entityType: 'PortfolioSite',
        entityId: site.id, after: { subdomain: site.subdomain },
      });
      const root = env().PORTFOLIO_ROOT_DOMAIN;
      return { site, url: root ? `https://${site.subdomain}.${root}` : `${env().APP_URL}/site/${site.subdomain}` };
    }),

  publishSite: permissionProcedure('portfolio:publish')
    .input(z.object({ id: z.string().uuid(), publish: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.portfolioSite.count({
        where: { id: input.id, organizationId: ctx.access.organizationId },
      });
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND' });

      const site = await publishSite(ctx.access.organizationId, input.id, input.publish);
      await recordAudit({
        session: ctx.session, action: input.publish ? 'portfolio.publish' : 'portfolio.unpublish',
        entityType: 'PortfolioSite', entityId: input.id,
      });
      return site;
    }),

  updateSite: permissionProcedure('portfolio:write')
    .input(z.object({
      id: z.string().uuid(),
      headline: z.string().max(200).optional(),
      subheadline: z.string().max(400).optional(),
      schedulerUrl: z.string().url().max(500).nullish(),
      showScheduler: z.boolean().optional(),
      showProposal: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const owned = await ctx.db.portfolioSite.count({
        where: { id, organizationId: ctx.access.organizationId },
      });
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.portfolioSite.update({ where: { id }, data });
    }),
});
