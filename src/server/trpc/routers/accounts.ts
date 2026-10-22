import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import {
  accountFacets, accountFieldsSchema, accountFilterSchema, accountInputSchema, archiveAccount, countAccounts,
  createAccount, getAccountDetail, listAccounts, overrideScore, setAccountStatus, updateAccount, findAccount,
} from '@/server/services/accounts';
import { parseCsv, suggestMapping, importRows, IMPORT_FIELDS, type ImportField } from '@/server/services/csv-import';
import { getTimeline, logActivity } from '@/server/services/activity';
import { currentProvenance } from '@/server/services/provenance';
import { rescoreAccount } from '@/server/services/scoring';
import { enrichAccount, discoverContacts } from '@/server/services/enrichment';
import { addManualSignal, dismissSignal, manualSignalSchema } from '@/server/services/signals';
import { messageThread } from '@/server/services/review';
import { ACCOUNT_STATUSES } from '@/lib/domain';
import { countDuplicateCandidates, dismissDuplicate, duplicatesForAccount, listDuplicateCandidates, mergeAccounts } from '@/server/services/companies/merge';
import { createSavedView, deleteSavedView, listSavedViews, savedViewInputSchema, SAVED_VIEW_SCOPES } from '@/server/services/saved-views';
import { can } from '@/lib/rbac';
import { recordAudit } from '@/lib/audit';

export const accountsRouter = router({
  list: permissionProcedure('account:read')
    .input(accountFilterSchema)
    .query(({ ctx, input }) => listAccounts(ctx.access, input)),

  count: permissionProcedure('account:read')
    .input(accountFilterSchema)
    .query(({ ctx, input }) => countAccounts(ctx.access, input)),

  facets: permissionProcedure('account:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => accountFacets(ctx.access, input.clientId)),

  byId: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getAccountDetail(ctx.access, input.id)),

  provenance: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await findAccount(ctx.access, input.id);
      return currentProvenance({ accountId: input.id });
    }),

  timeline: permissionProcedure('account:read')
    .input(z.object({ accountId: z.string().uuid().optional(), contactId: z.string().uuid().optional(), take: z.number().min(1).max(200).default(100) }))
    .query(({ ctx, input }) => getTimeline(ctx.access, input)),

  messages: permissionProcedure('account:read')
    .input(z.object({ accountId: z.string().uuid().optional(), contactId: z.string().uuid().optional() }))
    .query(({ ctx, input }) => messageThread(ctx.access, input)),

  create: permissionProcedure('account:write')
    .input(accountInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await createAccount(ctx.access, ctx.session.userId, input);
      if (result.status === 'created') {
        await recordAudit({ session: ctx.session, action: 'account.create', entityType: 'Account', entityId: result.accountId, after: { name: input.name } });
      }
      return result;
    }),

  update: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid(), data: accountFieldsSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const { before, after } = await updateAccount(ctx.access, ctx.session.userId, input.id, input.data);
      await recordAudit({ session: ctx.session, action: 'account.update', entityType: 'Account', entityId: input.id, before, after });
      return after;
    }),

  setStatus: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid(), status: z.enum(ACCOUNT_STATUSES), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { before, after } = await setAccountStatus(ctx.access, ctx.session.userId, input.id, input.status, input.reason);
      await recordAudit({ session: ctx.session, action: 'account.status', entityType: 'Account', entityId: input.id, before: { status: before.status }, after: { status: after.status } });
      return after;
    }),

  overrideScore: permissionProcedure('account:override')
    .input(z.object({ id: z.string().uuid(), score: z.number().int().min(0).max(100).nullable(), reason: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const result = await overrideScore(ctx.access, ctx.session.userId, input.id, input.score, input.reason);
      await recordAudit({ session: ctx.session, action: 'account.score_override', entityType: 'Account', entityId: input.id, after: input });
      return result;
    }),

  rescore: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await findAccount(ctx.access, input.id);
      return rescoreAccount(input.id);
    }),

  addNote: permissionProcedure('account:write')
    .input(z.object({ accountId: z.string().uuid(), contactId: z.string().uuid().optional(), body: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const account = await findAccount(ctx.access, input.accountId);
      return logActivity({
        organizationId: ctx.access.organizationId, clientId: account.clientId, accountId: account.id,
        contactId: input.contactId, userId: ctx.session.userId, type: 'NOTE', title: 'Note', body: input.body,
      });
    }),

  archive: permissionProcedure('account:delete')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await archiveAccount(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'account.archive', entityType: 'Account', entityId: input.id });
      return { ok: true };
    }),

  enrich: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => enrichAccount(ctx.access, input.id)),

  discoverContacts: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(10).default(5) }))
    .mutation(({ ctx, input }) => discoverContacts(ctx.access, input.id, input.limit)),

  addSignal: permissionProcedure('account:write')
    .input(manualSignalSchema)
    .mutation(({ ctx, input }) => addManualSignal(ctx.access, ctx.session.userId, input)),

  dismissSignal: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid(), reason: z.string().max(300).nullable().default(null) }))
    .mutation(({ ctx, input }) => dismissSignal(ctx.access, ctx.session.userId, input.id, input.reason)),

  previewImport: permissionProcedure('account:import')
    .input(z.object({ csv: z.string().max(8_000_000) }))
    .mutation(({ input }) => {
      const { headers, rows } = parseCsv(input.csv);
      return { headers, sample: rows.slice(0, 5), totalRows: rows.length, mapping: suggestMapping(headers), fields: IMPORT_FIELDS };
    }),

  runImport: permissionProcedure('account:import')
    .input(z.object({
      clientId: z.string().uuid(),
      csv: z.string().max(8_000_000),
      mapping: z.record(z.enum(IMPORT_FIELDS), z.number().int().min(0)),
    }))
    .mutation(async ({ ctx, input }) => {
      const { rows } = parseCsv(input.csv);
      const result = await importRows(ctx.access, ctx.session.userId, input.clientId, rows, input.mapping as Partial<Record<ImportField, number>>);
      await recordAudit({ session: ctx.session, action: 'account.import', entityType: 'Client', entityId: input.clientId, after: { ...result, failed: result.failed.length } });
      return result;
    }),

  // Possible duplicates and merging
  duplicates: permissionProcedure('account:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => listDuplicateCandidates(ctx.access, input.clientId)),

  duplicateCount: permissionProcedure('account:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => countDuplicateCandidates(ctx.access, input.clientId)),

  duplicatesOf: permissionProcedure('account:read')
    .input(z.object({ accountId: z.string().uuid() }))
    .query(({ ctx, input }) => duplicatesForAccount(ctx.access, input.accountId)),

  merge: permissionProcedure('account:override')
    .input(z.object({ keepId: z.string().uuid(), mergeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await mergeAccounts(ctx.access, ctx.session.userId, input.keepId, input.mergeId);
      await recordAudit({ session: ctx.session, action: 'account.merge', entityType: 'Account', entityId: input.keepId, after: input });
      return result;
    }),

  dismissDuplicate: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => dismissDuplicate(ctx.access, ctx.session.userId, input.id)),

  // Saved list views
  savedViews: permissionProcedure('account:read')
    .input(z.object({ scope: z.enum(SAVED_VIEW_SCOPES) }))
    .query(({ ctx, input }) => listSavedViews(ctx.access, input.scope)),

  saveView: permissionProcedure('account:read')
    .input(savedViewInputSchema)
    .mutation(({ ctx, input }) => createSavedView(ctx.access, input)),

  deleteView: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => deleteSavedView(ctx.access, input.id, can(ctx.session.role, 'settings:write'))),
});
