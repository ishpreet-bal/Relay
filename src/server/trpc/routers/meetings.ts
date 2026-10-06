import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { createMeeting, listMeetings, meetingFilterSchema, meetingInputSchema, meetingUpdateSchema, updateMeeting } from '@/server/services/meetings';
import { recordAudit } from '@/lib/audit';

export const meetingsRouter = router({
  list: permissionProcedure('meeting:read')
    .input(meetingFilterSchema)
    .query(({ ctx, input }) => listMeetings(ctx.access, input)),

  create: permissionProcedure('meeting:write')
    .input(meetingInputSchema)
    .mutation(async ({ ctx, input }) => {
      const meeting = await createMeeting(ctx.access, ctx.session.userId, input);
      await recordAudit({ session: ctx.session, action: 'meeting.create', entityType: 'Meeting', entityId: meeting.id });
      return meeting;
    }),

  update: permissionProcedure('meeting:write')
    .input(z.object({ id: z.string().uuid(), data: meetingUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await updateMeeting(ctx.access, ctx.session.userId, input.id, input.data);
      await recordAudit({ session: ctx.session, action: 'meeting.update', entityType: 'Meeting', entityId: input.id, after: input.data });
      return meeting;
    }),
});
