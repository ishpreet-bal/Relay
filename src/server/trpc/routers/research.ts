import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import { runResearch, ResearchError } from '@/server/ai/research';
import { monthlySpend } from '@/server/ai/budget';
import { BudgetExceededError } from '@/server/ai/budget';
import { recordAudit } from '@/lib/audit';

export const researchRouter = router({
  byLead: permissionProcedure('research:read')
    .input(z.object({ leadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const research = await ctx.db.research.findFirst({
        where: { leadId: input.leadId, organizationId: ctx.session.organizationId },
      });
      if (!research) return null;
      // The raw extract can be hundreds of KB; it's fetched separately by the
      // evidence drawer rather than shipped with every page load.
      const { rawExtract, ...rest } = research;
      return { ...rest, hasExtract: !!rawExtract };
    }),

  extract: permissionProcedure('research:read')
    .input(z.object({ leadId: z.string().uuid(), pageId: z.string().max(8) }))
    .query(async ({ ctx, input }) => {
      const research = await ctx.db.research.findFirst({
        where: { leadId: input.leadId, organizationId: ctx.session.organizationId },
        select: { rawExtract: true },
      });
      if (!research?.rawExtract) throw new TRPCError({ code: 'NOT_FOUND' });

      const block = research.rawExtract
        .split('\n\n---\n\n')
        .find((b) => b.startsWith(`[${input.pageId}]`));
      if (!block) throw new TRPCError({ code: 'NOT_FOUND' });

      const [header, ...body] = block.split('\n');
      return { url: header!.replace(/^\[\w+\]\s*/, ''), text: body.join('\n') };
    }),

  run: permissionProcedure('research:run')
    .input(z.object({ leadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await runResearch(ctx.session.organizationId, input.leadId);
        await recordAudit({
          session: ctx.session, action: 'research.run', entityType: 'Lead', entityId: input.leadId,
          after: { groundingRate: result.report.groundingRate, pages: result.pagesCrawled },
        });
        return result;
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message });
        }
        if (err instanceof ResearchError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err.code });
        }
        throw err;
      }
    }),

  /** Queues a batch without running it — the worker picks these up. */
  queueBatch: permissionProcedure('research:run')
    .input(z.object({ leadIds: z.array(z.string().uuid()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const leads = await ctx.db.lead.findMany({
        where: {
          id: { in: input.leadIds },
          organizationId: ctx.session.organizationId,
          websiteUrl: { not: null },
          deletedAt: null,
        },
        select: { id: true },
      });

      await ctx.db.$transaction(
        leads.map((l) =>
          ctx.db.research.upsert({
            where: { leadId: l.id },
            create: { leadId: l.id, organizationId: ctx.session.organizationId, status: 'QUEUED' },
            update: { status: 'QUEUED', error: null },
          }),
        ),
      );

      return { queued: leads.length, skipped: input.leadIds.length - leads.length };
    }),

  queue: permissionProcedure('research:read').query(({ ctx }) =>
    ctx.db.research.findMany({
      where: { organizationId: ctx.session.organizationId, status: { in: ['QUEUED', 'RUNNING', 'FAILED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { lead: { select: { id: true, companyName: true, domain: true, industry: true } } },
    }),
  ),

  spend: permissionProcedure('settings:read').query(({ ctx }) => monthlySpend(ctx.session.organizationId)),
});
