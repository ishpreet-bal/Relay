import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { ask, toolsFor } from '@/server/ai/assistant';

/** "Ask Relay": read-only answers, limited to what the asking user can see. */
export const assistantRouter = router({
  tools: permissionProcedure('account:read').query(({ ctx }) => toolsFor(ctx.session.role).map((t) => ({ name: t.name, description: t.description }))),

  ask: permissionProcedure('account:read')
    .input(z.object({
      question: z.string().trim().min(1).max(4000),
      history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) })).max(12).default([]),
    }))
    .mutation(({ ctx, input }) => ask(ctx.access, ctx.session.role, input.question, input.history)),
});
