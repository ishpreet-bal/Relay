import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import {
  archivePlaybook, copyPlaybookToClient, createPlaybook, findPlaybook, installStarterPlaybooks, listPlaybooks,
  playbookInputSchema, updatePlaybook,
} from '@/server/services/playbooks';
import { recordAudit } from '@/lib/audit';

export const playbooksRouter = router({
  list: permissionProcedure('playbook:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => listPlaybooks(ctx.access, input.clientId)),

  byId: permissionProcedure('playbook:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => findPlaybook(ctx.access, input.id)),

  create: permissionProcedure('playbook:write')
    .input(z.object({ clientId: z.string().uuid().nullable(), data: playbookInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const playbook = await createPlaybook(ctx.access, input.clientId, input.data);
      await recordAudit({ session: ctx.session, action: 'playbook.create', entityType: 'Playbook', entityId: playbook.id });
      return playbook;
    }),

  update: permissionProcedure('playbook:write')
    .input(z.object({ id: z.string().uuid(), data: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const playbook = await updatePlaybook(ctx.access, input.id, input.data);
      await recordAudit({ session: ctx.session, action: 'playbook.update', entityType: 'Playbook', entityId: input.id });
      return playbook;
    }),

  copyToClient: permissionProcedure('playbook:write')
    .input(z.object({ id: z.string().uuid(), clientId: z.string().uuid() }))
    .mutation(({ ctx, input }) => copyPlaybookToClient(ctx.access, input.id, input.clientId)),

  archive: permissionProcedure('playbook:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => archivePlaybook(ctx.access, input.id)),

  installStarters: permissionProcedure('playbook:write')
    .mutation(({ ctx }) => installStarterPlaybooks(ctx.access.organizationId)),
});
