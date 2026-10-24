import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { recordAudit } from '@/lib/audit';
import { addStartingPackages, deletePackage, listPackages, packageSchema, savePackage } from '@/server/services/service-packages';

/** Internal cost models. Costs and margins are billing information, so they need billing access. */
export const servicePackagesRouter = router({
  list: permissionProcedure('billing:manage').query(({ ctx }) => listPackages(ctx.access)),

  save: permissionProcedure('billing:manage')
    .input(z.object({ id: z.string().uuid().nullish(), data: packageSchema }))
    .mutation(async ({ ctx, input }) => {
      const saved = await savePackage(ctx.access, input.id ?? null, input.data);
      await recordAudit({ session: ctx.session, action: input.id ? 'service_package.updated' : 'service_package.created', entityType: 'ServicePackage', entityId: saved.id, after: input.data });
      return saved;
    }),

  delete: permissionProcedure('billing:manage')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deletePackage(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'service_package.deleted', entityType: 'ServicePackage', entityId: input.id });
    }),

  addStarting: permissionProcedure('billing:manage').mutation(({ ctx }) => addStartingPackages(ctx.access)),
});
