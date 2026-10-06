import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { draftMessage, regenerate, PersonalizeError } from '@/server/ai/personalize';
import { sendMessage, previewGate } from '@/server/services/email';
import { approveDraft, editDraft, findMessage, rejectDraft, reviewQueue, reviewSummary } from '@/server/services/review';
import { reclassifyReply } from '@/server/services/inbound';
import { findContact } from '@/server/services/contacts';
import { clientFilter } from '@/server/access/scope';
import { DomainError } from '@/server/errors';
import { REPLY_CLASSES } from '@/lib/domain';
import { recordAudit } from '@/lib/audit';

const STATUSES = ['DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] as const;
const VERIFICATION = ['VERIFIED', 'PARTIALLY_VERIFIED', 'REVIEW_REQUIRED', 'UNSUPPORTED', 'BLOCKED'] as const;

function personalizeErrors<T>(p: Promise<T>) {
  return p.catch((err) => {
    if (err instanceof PersonalizeError) throw new DomainError(err.message, err.code);
    throw err;
  });
}

export const messagesRouter = router({
  reviewQueue: permissionProcedure('message:read')
    .input(z.object({
      clientId: z.string().uuid().nullish(),
      status: z.array(z.enum(STATUSES)).default(['DRAFT', 'NEEDS_EDIT']),
      tier: z.array(z.enum(['VERIFIED', 'CONTEXTUAL', 'NONE'])).optional(),
      verification: z.array(z.enum(VERIFICATION)).optional(),
      campaignId: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).default(25),
      cursor: z.string().uuid().optional(),
    }))
    .query(({ ctx, input }) => reviewQueue(ctx.access, input)),

  queueSummary: permissionProcedure('message:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => reviewSummary(ctx.access, input.clientId)),

  gateStatus: permissionProcedure('message:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await findMessage(ctx.access, input.id);
      return previewGate(input.id);
    }),

  /** A one-off draft for a contact, outside any campaign. */
  draft: permissionProcedure('message:draft')
    .input(z.object({
      contactId: z.string().uuid(),
      stepInstructions: z.string().max(2000).optional(),
      toneGuidelines: z.string().max(2000).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      await findContact(ctx.access, input.contactId);
      const result = await personalizeErrors(draftMessage({
        organizationId: ctx.access.organizationId,
        contactId: input.contactId,
        stepInstructions: input.stepInstructions,
        toneGuidelines: input.toneGuidelines,
        userId: ctx.session.userId,
      }));
      return { id: result.message.id, tier: result.tier, verification: result.verification.status, score: result.verification.score };
    }),

  regenerate: permissionProcedure('message:draft')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await findMessage(ctx.access, input.id);
      const result = await personalizeErrors(regenerate(input.id, ctx.access.organizationId, ctx.session.userId));
      return { id: result.message.id };
    }),

  edit: permissionProcedure('message:draft')
    .input(z.object({ id: z.string().uuid(), subject: z.string().min(1).max(200), bodyText: z.string().min(1).max(10000) }))
    .mutation(({ ctx, input }) => editDraft(ctx.access, ctx.session.userId, input)),

  approve: permissionProcedure('message:approve')
    .input(z.object({
      id: z.string().uuid(),
      scheduledFor: z.date().optional(),
      acknowledgeUnverified: z.boolean().optional(),
      note: z.string().max(1000).optional(),
    }))
    .mutation(({ ctx, input }) => approveDraft(ctx.access, ctx.session.userId, input)),

  reject: permissionProcedure('message:draft')
    .input(z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await rejectDraft(ctx.access, ctx.session.userId, input);
      return { ok: true };
    }),

  /** Approve (if still a draft) and send now — still passes through the gate. */
  send: permissionProcedure('message:send')
    .input(z.object({ id: z.string().uuid(), acknowledgeUnverified: z.boolean().optional(), note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const message = await findMessage(ctx.access, input.id);
      if (message.status === 'DRAFT' || message.status === 'NEEDS_EDIT') {
        await approveDraft(ctx.access, ctx.session.userId, input);
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
        where: { id: { in: input.ids }, ...clientFilter(ctx.access), status: 'APPROVED' },
        select: { id: true },
      });
      const results = [];
      for (const m of owned) {
        try {
          // Sequential: the gate enforces a minimum gap between sends.
          results.push(await sendMessage(m.id));
        } catch (err) {
          results.push({ sent: false, messageId: m.id, error: err instanceof Error ? err.message : 'failed' });
        }
      }
      return { attempted: owned.length, sent: results.filter((r) => 'sent' in r && r.sent).length, results };
    }),

  classifyReply: permissionProcedure('message:read')
    .input(z.object({ id: z.string().uuid(), replyClass: z.enum(REPLY_CLASSES) }))
    .mutation(async ({ ctx, input }) => {
      const message = await findMessage(ctx.access, input.id);
      if (message.direction !== 'INBOUND') throw new DomainError('Only replies can be classified.');
      return reclassifyReply(input.id, input.replyClass);
    }),
});
