import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import { draftMessage, regenerate, renderHtml, PersonalizeError } from '@/server/ai/personalize';
import { lintDraft, hasBlockers } from '@/server/ai/lint';
import { sendMessage, previewGate } from '@/server/services/email';
import { recordAudit } from '@/lib/audit';
import { logActivity } from '@/server/services/crm';
import { BudgetExceededError } from '@/server/ai/budget';

const draftOptions = z.object({
  senderName: z.string().min(1).max(80),
  offerBrief: z.string().min(1).max(2000),
  toneGuidelines: z.string().max(2000).nullish(),
  bannedPhrases: z.array(z.string().max(80)).max(50).default([]),
  stepPurpose: z.string().max(60).optional(),
  stepInstructions: z.string().max(2000).optional(),
  allowContextual: z.boolean().default(true),
});

export const messagesRouter = router({
  reviewQueue: permissionProcedure('message:read')
    .input(z.object({
      status: z.array(z.enum(['DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'])).default(['DRAFT', 'NEEDS_EDIT']),
      tier: z.array(z.enum(['VERIFIED', 'CONTEXTUAL', 'NONE'])).optional(),
      campaignId: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).default(25),
      cursor: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.message.findMany({
        where: {
          organizationId: ctx.session.organizationId,
          direction: 'OUTBOUND',
          status: { in: input.status },
          ...(input.tier ? { personalizationTier: { in: input.tier } } : {}),
          ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        },
        orderBy: [{ personalizationTier: 'asc' }, { createdAt: 'asc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          lead: { select: { id: true, companyName: true, industry: true, city: true, score: true, domain: true } },
          campaign: { select: { id: true, name: true } },
        },
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    }),

  /** Counts for the queue's filter chips, so the operator can see the split. */
  queueSummary: permissionProcedure('message:read').query(async ({ ctx }) => {
    const grouped = await ctx.db.message.groupBy({
      by: ['personalizationTier', 'status'],
      where: {
        organizationId: ctx.session.organizationId,
        direction: 'OUTBOUND',
        status: { in: ['DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] },
      },
      _count: true,
    });
    return grouped.map((g) => ({ tier: g.personalizationTier, status: g.status, count: g._count }));
  }),

  gateStatus: permissionProcedure('message:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const owned = await ctx.db.message.count({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND' });
      return previewGate(input.id);
    }),

  draft: permissionProcedure('message:draft')
    .input(z.object({ leadId: z.string().uuid(), options: draftOptions }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await draftMessage({
          organizationId: ctx.session.organizationId,
          leadId: input.leadId,
          ...input.options,
        });
      } catch (err) {
        if (err instanceof BudgetExceededError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message });
        if (err instanceof PersonalizeError) throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err.code });
        throw err;
      }
    }),

  regenerate: permissionProcedure('message:draft')
    .input(z.object({ id: z.string().uuid(), options: draftOptions }))
    .mutation(({ ctx, input }) => regenerate(input.id, ctx.session.organizationId, input.options)),

  /**
   * Human edits re-run the linter against the edited text. An operator can
   * override a warning by editing around it, but cannot accidentally leave a
   * blocker in place — the status recomputes from the new body.
   */
  edit: permissionProcedure('message:draft')
    .input(z.object({
      id: z.string().uuid(),
      subject: z.string().min(1).max(200),
      bodyText: z.string().min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.message.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' });
      if (['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'].includes(message.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This message has already been sent.' });
      }

      const facts = (message.personalizationFacts ?? []) as Array<{ statement: string }>;
      const findings = lintDraft({
        subject: input.subject,
        body: input.bodyText,
        tier: message.personalizationTier,
        allowedFacts: facts.map((f) => f.statement),
      });

      return ctx.db.message.update({
        where: { id: input.id },
        data: {
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: renderHtml(input.bodyText),
          lintFindings: findings as never,
          editedByHuman: true,
          // Editing an approved message revokes the approval. Approval attaches
          // to specific words, not to a row.
          status: hasBlockers(findings) ? 'NEEDS_EDIT' : 'DRAFT',
          approvedById: null,
          approvedAt: null,
        },
      });
    }),

  approve: permissionProcedure('message:approve')
    .input(z.object({ id: z.string().uuid(), scheduledFor: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.message.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' });

      const findings = (message.lintFindings ?? []) as Array<{ severity: string }>;
      if (findings.some((f) => f.severity === 'block')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This draft has unresolved blockers. Edit it before approving.',
        });
      }

      const updated = await ctx.db.message.update({
        where: { id: input.id },
        data: {
          status: input.scheduledFor ? 'SCHEDULED' : 'APPROVED',
          scheduledFor: input.scheduledFor ?? null,
          approvedById: ctx.session.userId,
          approvedAt: new Date(),
        },
      });
      await recordAudit({
        session: ctx.session, action: 'message.approve', entityType: 'Message', entityId: input.id,
        before: { status: message.status }, after: { status: updated.status, tier: message.personalizationTier },
      });
      return updated;
    }),

  reject: permissionProcedure('message:draft')
    .input(z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.message.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db.message.update({
        where: { id: input.id },
        data: { status: 'CANCELLED', failureReason: input.reason ?? 'Rejected in review' },
      });
      await logActivity({
        organizationId: ctx.session.organizationId, leadId: message.leadId,
        userId: ctx.session.userId, type: 'SYSTEM',
        title: 'Draft rejected', body: input.reason,
      });
      return { ok: true };
    }),

  /** Approve and send in one action — still passes through the gate. */
  send: permissionProcedure('message:send')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.message.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' });

      if (message.status === 'DRAFT' || message.status === 'NEEDS_EDIT') {
        const findings = (message.lintFindings ?? []) as Array<{ severity: string }>;
        if (findings.some((f) => f.severity === 'block')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Resolve the blockers before sending.' });
        }
        await ctx.db.message.update({
          where: { id: input.id },
          data: { status: 'APPROVED', approvedById: ctx.session.userId, approvedAt: new Date() },
        });
      }

      const outcome = await sendMessage(input.id);
      await recordAudit({
        session: ctx.session, action: outcome.sent ? 'message.send' : 'message.blocked',
        entityType: 'Message', entityId: input.id, after: outcome.verdict,
      });
      return outcome;
    }),

  sendApproved: permissionProcedure('message:send')
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.message.findMany({
        where: { id: { in: input.ids }, organizationId: ctx.session.organizationId, status: 'APPROVED' },
        select: { id: true },
      });

      const results = [];
      for (const m of owned) {
        try {
          // Sequential, not parallel: the gate enforces a minimum gap between
          // sends, and firing fifty at once would defeat it.
          results.push(await sendMessage(m.id));
        } catch (err) {
          results.push({ sent: false, messageId: m.id, error: err instanceof Error ? err.message : 'failed' });
        }
      }
      return { attempted: owned.length, sent: results.filter((r) => 'sent' in r && r.sent).length, results };
    }),
});
