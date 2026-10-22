import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { connectorById, connectorStates } from '@/server/connectors/registry';
import {
  archiveProfile, createProfile, discoveryProfileSchema, getProfile, listProfiles, updateProfile, DISCOVERY_SOURCES,
} from '@/server/services/discovery/profiles';
import { cancelDiscoveryRun, getRun, listRunResults, listRuns, startDiscoveryRun } from '@/server/services/discovery/run';
import { GTA_DEFAULTS, planQueries } from '@/server/services/discovery/plan';
import { heartbeat, runJobNow } from '@/server/services/job-runner';
import { recordAudit } from '@/lib/audit';

const DISCOVERY_OUTCOMES = ['CREATED', 'UPDATED', 'DUPLICATE', 'EXCLUDED', 'NEEDS_REVIEW', 'FAILED'] as const;

// Reading profiles and results is for anyone who works prospects; creating
// profiles and starting runs spends money, so it needs import rights.
export const discoveryRouter = router({
  sources: permissionProcedure('account:read').query(async ({ ctx }) => {
    const states = await connectorStates(ctx.access.organizationId);
    return DISCOVERY_SOURCES.map((id) => {
      const s = states.find((x) => x.id === id)!;
      const def = connectorById(id)!.discovery!;
      const cost = def.requestCost();
      return {
        id, name: s.name, description: s.description, usable: s.usable, configured: s.configured, enabled: s.enabled,
        missingEnv: s.missingEnv, lastError: s.lastError, storage: def.storage, requestCostMillicents: cost.millicents,
        costIsEstimate: cost.isEstimate, maxPages: def.maxPages, queryStyle: def.queryStyle,
      };
    });
  }),

  defaults: permissionProcedure('account:read').query(() => GTA_DEFAULTS),

  profiles: permissionProcedure('account:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => listProfiles(ctx.access, input.clientId)),

  profile: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getProfile(ctx.access, input.id)),

  /** The searches a profile would run, and their worst-case cost, before spending anything. */
  preview: permissionProcedure('account:read')
    .input(discoveryProfileSchema)
    .query(({ input }) => {
      const plan = { ...input, latitude: input.latitude, longitude: input.longitude };
      return input.sources.map((id) => {
        const def = connectorById(id)!.discovery!;
        const queries = planQueries(plan, def.queryStyle);
        const perPage = def.queryStyle === 'structured' ? Math.min(100, input.maxResultsPerRun) : Math.min(20, input.maxResultsPerRun);
        // Paging stops at the result limit, so it bounds requests as much as the query count does.
        const maxRequests = Math.min(queries.length * def.maxPages, queries.length + Math.ceil(input.maxResultsPerRun / perPage));
        return { source: id, queries: queries.map((q) => q.text), maxRequests, maxCostMillicents: maxRequests * def.requestCost().millicents };
      });
    }),

  createProfile: permissionProcedure('account:import')
    .input(discoveryProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await createProfile(ctx.access, ctx.session.userId, input);
      await recordAudit({ session: ctx.session, action: 'discovery_profile.create', entityType: 'DiscoveryProfile', entityId: profile.id, after: input });
      return profile;
    }),

  updateProfile: permissionProcedure('account:import')
    .input(z.object({ id: z.string().uuid(), data: discoveryProfileSchema }))
    .mutation(async ({ ctx, input }) => {
      const profile = await updateProfile(ctx.access, input.id, input.data);
      await recordAudit({ session: ctx.session, action: 'discovery_profile.update', entityType: 'DiscoveryProfile', entityId: input.id, after: input.data });
      return profile;
    }),

  archiveProfile: permissionProcedure('account:import')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await archiveProfile(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'discovery_profile.archive', entityType: 'DiscoveryProfile', entityId: input.id });
      return { ok: true };
    }),

  run: permissionProcedure('account:import')
    .input(z.object({ profileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await startDiscoveryRun(ctx.access, ctx.session.userId, input.profileId, 'MANUAL');
      if (result.started) {
        await recordAudit({ session: ctx.session, action: 'discovery_run.start', entityType: 'DiscoveryRun', entityId: result.run.id });
      }
      return result;
    }),

  /**
   * Moves a run forward for about 45 seconds. The Discovery page calls this
   * while a run is open, so runs finish without a background worker; when a
   * worker or the cron tick holds the run, this does nothing.
   */
  step: permissionProcedure('account:import')
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const run = await getRun(ctx.access, input.runId);
      if (['QUEUED', 'RUNNING', 'RETRYING'].includes(run.status)) {
        const job = await ctx.db.job.findFirst({
          where: { organizationId: ctx.access.organizationId, type: 'DISCOVERY_RUN', entityId: run.id, status: { in: ['QUEUED', 'RETRYING', 'RUNNING'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (job) {
          const ran = await runJobNow(job.id, `web:${ctx.session.userId}`, { deadline: Date.now() + 45_000 });
          if (ran) await heartbeat('web', 'page', 1, null);
        }
      }
      const after = await getRun(ctx.access, input.runId);
      return { status: after.status, found: after.found };
    }),

  cancel: permissionProcedure('account:import')
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await cancelDiscoveryRun(ctx.access, input.runId);
      await recordAudit({ session: ctx.session, action: 'discovery_run.cancel', entityType: 'DiscoveryRun', entityId: input.runId });
      return { ok: true };
    }),

  runs: permissionProcedure('account:read')
    .input(z.object({ profileId: z.string().uuid().nullish(), clientId: z.string().uuid().nullish(), limit: z.number().int().min(1).max(100).default(25) }).default({}))
    .query(({ ctx, input }) => listRuns(ctx.access, input)),

  runById: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getRun(ctx.access, input.id)),

  results: permissionProcedure('account:read')
    .input(z.object({
      runId: z.string().uuid(),
      outcome: z.enum(DISCOVERY_OUTCOMES).nullish(),
      cursor: z.string().uuid().nullish(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(({ ctx, input }) => listRunResults(ctx.access, input.runId, input)),
});
