import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';

/** Named list filters. Private to their author unless shared with the workspace. */

export const SAVED_VIEW_SCOPES = ['accounts', 'contacts'] as const;

export const savedViewInputSchema = z.object({
  scope: z.enum(SAVED_VIEW_SCOPES),
  name: z.string().trim().min(1).max(80),
  // The list's own filter schema validates these when the view is applied.
  filters: z.record(z.unknown()),
  shared: z.boolean().default(false),
});

export function listSavedViews(access: AccessContext, scope: (typeof SAVED_VIEW_SCOPES)[number]) {
  return db.savedView.findMany({
    where: { organizationId: access.organizationId, scope, OR: [{ userId: access.userId }, { userId: null }] },
    orderBy: { name: 'asc' },
  });
}

export function createSavedView(access: AccessContext, raw: z.input<typeof savedViewInputSchema>) {
  const input = savedViewInputSchema.parse(raw);
  return db.savedView.create({
    data: {
      organizationId: access.organizationId,
      userId: input.shared ? null : access.userId,
      scope: input.scope,
      name: input.name,
      filters: input.filters as Prisma.InputJsonValue,
    },
  });
}

export async function deleteSavedView(access: AccessContext, id: string, canManageShared: boolean) {
  const view = await db.savedView.findFirst({ where: { id, organizationId: access.organizationId } });
  if (!view) throw new NotFoundError('Saved view');
  if (view.userId ? view.userId !== access.userId : !canManageShared) {
    throw new DomainError('Only its author or an admin can delete this view.');
  }
  await db.savedView.delete({ where: { id } });
}
