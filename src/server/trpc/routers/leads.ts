import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure, protectedProcedure } from '../init';
import {
  listLeads, countLeads, leadFacets, createLead, rescoreLead,
  leadFilterSchema, leadInputSchema,
} from '@/server/services/leads';
import { parseCsv, suggestMapping, importRows, IMPORT_FIELDS } from '@/server/services/csv-import';
import { getTimeline, logActivity } from '@/server/services/crm';
import { recordAudit } from '@/lib/audit';

export const leadsRouter = router({
  list: permissionProcedure('lead:read')
    .input(leadFilterSchema)
    .query(({ ctx, input }) => listLeads(ctx.session.organizationId, input)),

  count: permissionProcedure('lead:read')
    .input(leadFilterSchema)
    .query(({ ctx, input }) => countLeads(ctx.session.organizationId, input)),

  facets: permissionProcedure('lead:read')
    .query(({ ctx }) => leadFacets(ctx.session.organizationId)),

  byId: permissionProcedure('lead:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId, deletedAt: null },
        include: {
          contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          research: true,
          owner: { select: { firstName: true, lastName: true, avatarUrl: true } },
          tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' } },
          meetings: { orderBy: { startsAt: 'desc' }, take: 10 },
          proposals: { orderBy: { createdAt: 'desc' }, take: 10 },
          messages: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
      if (!lead) throw new TRPCError({ code: 'NOT_FOUND' });
      return lead;
    }),

  timeline: permissionProcedure('lead:read')
    .input(z.object({ leadId: z.string().uuid(), take: z.number().min(1).max(200).default(100) }))
    .query(({ ctx, input }) => getTimeline(ctx.session.organizationId, input.leadId, input.take)),

  create: permissionProcedure('lead:write')
    .input(leadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { lead, duplicate } = await createLead(ctx.session.organizationId, ctx.session.userId, input);
      if (!duplicate) {
        await recordAudit({ session: ctx.session, action: 'lead.create', entityType: 'Lead', entityId: lead.id, after: lead });
      }
      return { lead, duplicate };
    }),

  update: permissionProcedure('lead:write')
    .input(z.object({ id: z.string().uuid(), data: leadInputSchema.partial().omit({ contact: true, source: true }) }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.lead.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const after = await ctx.db.lead.update({ where: { id: input.id }, data: input.data });
      await rescoreLead(input.id);
      await recordAudit({ session: ctx.session, action: 'lead.update', entityType: 'Lead', entityId: input.id, before, after });
      return after;
    }),

  setStatus: permissionProcedure('lead:write')
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['DISCOVERED','RESEARCHING','RESEARCHED','DRAFTED','APPROVED','CONTACTED','ENGAGED','MEETING_BOOKED','PROPOSAL_SENT','WON','LOST','DISQUALIFIED','SUPPRESSED']),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.lead.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const lead = await ctx.db.lead.update({ where: { id: input.id }, data: { status: input.status } });
      await logActivity({
        organizationId: ctx.session.organizationId, leadId: lead.id, userId: ctx.session.userId,
        type: 'STATUS_CHANGE',
        title: `Status changed to ${input.status.toLowerCase().replace(/_/g, ' ')}`,
        body: input.reason,
        metadata: { from: before.status, to: input.status },
      });
      await recordAudit({ session: ctx.session, action: 'lead.status', entityType: 'Lead', entityId: lead.id, before, after: lead });
      return lead;
    }),

  addNote: permissionProcedure('lead:write')
    .input(z.object({ leadId: z.string().uuid(), body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findFirst({
        where: { id: input.leadId, organizationId: ctx.session.organizationId },
      });
      if (!lead) throw new TRPCError({ code: 'NOT_FOUND' });
      return logActivity({
        organizationId: ctx.session.organizationId, leadId: input.leadId,
        userId: ctx.session.userId, type: 'NOTE', title: 'Note', body: input.body,
      });
    }),

  // Soft delete only. Outbound history must survive the lead record for
  // suppression and compliance evidence.
  archive: permissionProcedure('lead:delete')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.updateMany({
        where: { id: input.id, organizationId: ctx.session.organizationId },
        data: { deletedAt: new Date() },
      });
      if (lead.count === 0) throw new TRPCError({ code: 'NOT_FOUND' });
      await recordAudit({ session: ctx.session, action: 'lead.archive', entityType: 'Lead', entityId: input.id });
      return { ok: true };
    }),

  previewImport: permissionProcedure('lead:import')
    .input(z.object({ csv: z.string().max(8_000_000) }))
    .mutation(({ input }) => {
      const { headers, rows } = parseCsv(input.csv);
      if (!headers.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No header row found' });
      return {
        headers,
        sample: rows.slice(0, 5),
        totalRows: rows.length,
        mapping: suggestMapping(headers),
        fields: IMPORT_FIELDS,
      };
    }),

  runImport: permissionProcedure('lead:import')
    .input(z.object({
      csv: z.string().max(8_000_000),
      mapping: z.record(z.string(), z.number().int().min(0)),
    }))
    .mutation(async ({ ctx, input }) => {
      const { rows } = parseCsv(input.csv);
      const result = await importRows(
        ctx.session.organizationId, ctx.session.userId, rows, input.mapping as never,
      );
      await recordAudit({
        session: ctx.session, action: 'lead.import', entityType: 'Lead', after: result,
      });
      return result;
    }),

  me: protectedProcedure.query(({ ctx }) => ctx.session),
});
