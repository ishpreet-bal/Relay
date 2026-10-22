import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { recordAudit } from '@/lib/audit';
import {
  authorizeSubscription, cancelSubscription, createSubscription, draftFromProject, listInvoices, listSubscriptions, markInvoicePaid, subscriptionSchema, updateDraft, voidInvoice,
} from '@/server/services/customer-billing/subscriptions';
import { customerProfitability, financialSummary, mrrHistory } from '@/server/services/customer-billing/reports';
import { liveChargesEnabled, stripeMode } from '@/server/services/customer-billing/stripe-adapter';

const id = z.string().uuid();
const month = z.string().regex(/^\d{4}-\d{2}$/);

/** Customer billing and the agency's finances. The workspace owner only (billing:manage). */
export const billingRouter = router({
  mode: permissionProcedure('billing:manage').query(() => ({ stripe: stripeMode(), liveChargesEnabled: liveChargesEnabled() })),

  subscriptions: permissionProcedure('billing:manage').input(z.object({ clientId: id.nullish() }).default({})).query(({ ctx, input }) => listSubscriptions(ctx.access, input.clientId)),

  invoices: permissionProcedure('billing:manage')
    .input(z.object({ clientId: id.nullish(), subscriptionId: id.nullish(), status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']).nullish() }).default({}))
    .query(({ ctx, input }) => listInvoices(ctx.access, input)),

  create: permissionProcedure('billing:manage').input(subscriptionSchema).mutation(({ ctx, input }) => createSubscription(ctx.access, ctx.session.userId, input)),

  draftFromProject: permissionProcedure('billing:manage')
    .input(z.object({ projectId: id, includedRuns: z.number().int().min(0).optional(), overageMillicentsPerRun: z.number().int().min(0).optional(), provider: z.enum(['ledger', 'stripe']).optional() }))
    .mutation(({ ctx, input }) => draftFromProject(ctx.access, ctx.session.userId, input.projectId, input)),

  updateDraft: permissionProcedure('billing:manage')
    .input(subscriptionSchema.partial().omit({ clientId: true }).extend({ id }))
    .mutation(({ ctx, input }) => { const { id: subId, ...rest } = input; return updateDraft(ctx.access, subId, rest); }),

  authorize: permissionProcedure('billing:manage')
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      const sub = await authorizeSubscription(ctx.access, ctx.session.userId, input.id);
      await recordAudit({ session: ctx.session, action: 'billing.authorize', entityType: 'CustomerSubscription', entityId: sub.id, after: { provider: sub.provider, monthlyCents: sub.monthlyCents, setupFeeCents: sub.setupFeeCents, livemode: sub.livemode } });
      return sub;
    }),

  cancel: permissionProcedure('billing:manage')
    .input(z.object({ id, atPeriodEnd: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await cancelSubscription(ctx.access, input.id, { atPeriodEnd: input.atPeriodEnd });
      await recordAudit({ session: ctx.session, action: 'billing.cancel', entityType: 'CustomerSubscription', entityId: input.id, after: { atPeriodEnd: input.atPeriodEnd } });
      return sub;
    }),

  markPaid: permissionProcedure('billing:manage').input(z.object({ id })).mutation(({ ctx, input }) => markInvoicePaid(ctx.access, input.id)),

  void: permissionProcedure('billing:manage')
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      const inv = await voidInvoice(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'billing.void', entityType: 'CustomerInvoice', entityId: input.id });
      return inv;
    }),

  summary: permissionProcedure('billing:manage').input(z.object({ month })).query(({ ctx, input }) => financialSummary(ctx.access, input.month)),
  mrrHistory: permissionProcedure('billing:manage').input(z.object({ months: z.number().int().min(1).max(24).default(6) }).default({})).query(({ ctx, input }) => mrrHistory(ctx.access, input.months)),
  profitability: permissionProcedure('billing:manage').input(z.object({ month })).query(({ ctx, input }) => customerProfitability(ctx.access, input.month)),
});
