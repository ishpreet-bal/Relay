import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { addToQueue, assignCallTasks, listQueue, snoozeCallTask } from '@/server/services/call-queue';
import { getCallPrep, listCalls, logCall, logCallSchema } from '@/server/services/calls';
import { recordAudit } from '@/lib/audit';
import { clientFilter } from '@/server/access/scope';
import { enqueueJob } from '@/server/services/jobs';

const CATEGORIES = ['CALLBACK_DUE', 'REPLIED', 'ENGAGED', 'SIGNAL', 'HIGH_FIT', 'MANUAL'] as const;

export const callsRouter = router({
  queue: permissionProcedure('call:read')
    .input(z.object({
      clientId: z.string().uuid().nullish(),
      assignee: z.enum(['me', 'unassigned', 'all']).default('me'),
      category: z.enum(CATEGORIES).optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(({ ctx, input }) => listQueue(ctx.access, input)),

  refresh: permissionProcedure('call:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .mutation(async ({ ctx, input }) => {
      // Validate client scope before queuing; processing belongs on the worker,
      // not a web request that can time out while refreshing 1,500 prospects.
      clientFilter(ctx.access, input.clientId);
      const job = await enqueueJob({ type: 'CALL_QUEUE_REFRESH', organizationId: ctx.access.organizationId,
        clientId: input.clientId ?? null, createdById: ctx.session.userId,
        dedupeKey: `call-queue-refresh:${ctx.access.organizationId}:${input.clientId ?? 'all'}` });
      return { queued: !!job };
    }),

  addToQueue: permissionProcedure('call:log')
    .input(z.object({ contactId: z.string().uuid() }))
    .mutation(({ ctx, input }) => addToQueue(ctx.access, input.contactId)),

  assign: permissionProcedure('call:assign')
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(200), assigneeId: z.string().uuid().nullable() }))
    .mutation(({ ctx, input }) => assignCallTasks(ctx.access, input.ids, input.assigneeId)),

  snooze: permissionProcedure('call:log')
    .input(z.object({ id: z.string().uuid(), until: z.coerce.date() }))
    .mutation(({ ctx, input }) => snoozeCallTask(ctx.access, input.id, input.until)),

  prep: permissionProcedure('call:read')
    .input(z.object({ contactId: z.string().uuid() }))
    .query(({ ctx, input }) => getCallPrep(ctx.access, input.contactId, ctx.session.name)),

  log: permissionProcedure('call:log')
    .input(logCallSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await logCall(ctx.access, ctx.session.userId, input);
      await recordAudit({ session: ctx.session, action: 'call.log', entityType: 'Call', entityId: result.call.id, after: { outcome: input.outcome } });
      return { callId: result.call.id, meetingId: result.meetingId, referredContactId: result.referredContactId };
    }),

  recent: permissionProcedure('call:read')
    .input(z.object({ clientId: z.string().uuid().nullish(), mine: z.boolean().default(false), limit: z.number().int().min(1).max(200).default(50) }))
    .query(({ ctx, input }) => listCalls(ctx.access, { clientId: input.clientId, callerId: input.mine ? ctx.session.userId : undefined, limit: input.limit })),

  /** People a call task can be assigned to. */
  callers: permissionProcedure('call:assign').query(({ ctx }) =>
    ctx.db.membership.findMany({
      where: { organizationId: ctx.access.organizationId, role: { in: ['CALLER', 'OPERATOR', 'RELAY_ADMIN', 'SUPER_ADMIN'] } },
      select: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, role: true },
    }),
  ),
});
