import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { recordAudit } from '@/lib/audit';
import { bookConsultation, INQUIRY_STATUSES, listInquiries, relinkInquiry, updateInquiry, updateInquirySchema } from '@/server/services/inquiries';

const id = z.string().uuid();

/** Inquiries sent from the public website. */
export const inquiriesRouter = router({
  list: permissionProcedure('account:read')
    .input(z.object({ status: z.enum(INQUIRY_STATUSES).nullish(), cursor: id.nullish(), limit: z.number().int().min(1).max(100).default(30) }).default({}))
    .query(({ ctx, input }) => listInquiries(ctx.access, input)),

  update: permissionProcedure('account:write')
    .input(z.object({ id }).merge(updateInquirySchema))
    .mutation(async ({ ctx, input }) => {
      const { id: inquiryId, ...change } = input;
      const after = await updateInquiry(ctx.access, inquiryId, change);
      await recordAudit({ session: ctx.session, action: 'inquiry.updated', entityType: 'Inquiry', entityId: inquiryId, after: change });
      return after;
    }),

  link: permissionProcedure('account:write')
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => relinkInquiry(ctx.access, input.id)),

  book: permissionProcedure('meeting:write')
    .input(z.object({ id, startsAt: z.string().datetime() }))
    .mutation(async ({ ctx, input }) => {
      const result = await bookConsultation(ctx.access, ctx.session.userId, input.id, input.startsAt);
      await recordAudit({ session: ctx.session, action: 'inquiry.consultation_booked', entityType: 'Meeting', entityId: result.meetingId, after: { inquiryId: input.id, startsAt: input.startsAt } });
      return result;
    }),
});
