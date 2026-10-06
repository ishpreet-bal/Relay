import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import { runResearch, ResearchError } from '@/server/ai/research';
import { monthlySpend } from '@/server/ai/budget';
import { clientFilter } from '@/server/access/scope';
import { findAccount } from '@/server/services/accounts';
import { recordAudit } from '@/lib/audit';

export const researchRouter = router({
  byAccount: permissionProcedure('research:read')
    .input(z.object({ accountId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const research = await ctx.db.research.findFirst({
        where: { accountId: input.accountId, ...clientFilter(ctx.access) },
      });
      if (!research) return null;
      // The raw extract can be hundreds of KB; the evidence drawer fetches
      // one page of it at a time.
      const { rawExtract, ...rest } = research;
      return { ...rest, hasExtract: !!rawExtract };
    }),

  extract: permissionProcedure('research:read')
    .input(z.object({ accountId: z.string().uuid(), pageId: z.string().max(8) }))
    .query(async ({ ctx, input }) => {
      const research = await ctx.db.research.findFirst({
        where: { accountId: input.accountId, ...clientFilter(ctx.access) },
        select: { rawExtract: true },
      });
      if (!research?.rawExtract) throw new TRPCError({ code: 'NOT_FOUND' });
      const block = research.rawExtract.split('\n\n---\n\n').find((b) => b.startsWith(`[${input.pageId}]`));
      if (!block) throw new TRPCError({ code: 'NOT_FOUND' });
      const [header, ...body] = block.split('\n');
      return { url: header!.replace(/^\[\w+\]\s*/, ''), text: body.join('\n') };
    }),

  run: permissionProcedure('research:run')
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await findAccount(ctx.access, input.accountId);
      try {
        const result = await runResearch(ctx.access.organizationId, input.accountId);
        await recordAudit({
          session: ctx.session, action: 'research.run', entityType: 'Account', entityId: input.accountId,
          after: { groundingRate: result.report.groundingRate, pages: result.pagesCrawled, signals: result.signalsCreated },
        });
        return { report: result.report, pagesCrawled: result.pagesCrawled, signalsCreated: result.signalsCreated };
      } catch (err) {
        if (err instanceof ResearchError) throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
        throw err;
      }
    }),

  /** Queues research for the worker instead of running it inline. */
  queueBatch: permissionProcedure('research:run')
    .input(z.object({ accountIds: z.array(z.string().uuid()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const accounts = await ctx.db.account.findMany({
        where: { id: { in: input.accountIds }, ...clientFilter(ctx.access), websiteUrl: { not: null }, deletedAt: null },
        select: { id: true, clientId: true },
      });
      await ctx.db.$transaction(accounts.map((a) =>
        ctx.db.research.upsert({
          where: { accountId: a.id },
          create: { accountId: a.id, organizationId: ctx.access.organizationId, clientId: a.clientId, status: 'QUEUED' },
          update: { status: 'QUEUED', error: null },
        }),
      ));
      return { queued: accounts.length, skipped: input.accountIds.length - accounts.length };
    }),

  queue: permissionProcedure('research:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) =>
      ctx.db.research.findMany({
        where: { ...clientFilter(ctx.access, input.clientId), status: { in: ['QUEUED', 'RUNNING', 'FAILED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { account: { select: { id: true, name: true, domain: true, industry: true } }, client: { select: { name: true } } },
      }),
    ),

  spend: permissionProcedure('ops:read').query(({ ctx }) => monthlySpend(ctx.access.organizationId)),
});
