import { db } from '@/lib/db';
import type { SuppressionReason, SuppressionScope } from '@prisma/client';
import { logActivity } from './crm';

/**
 * Suppression is the platform's memory of who not to email. Adding an entry
 * cancels everything already in flight for that address in one transaction —
 * an opt-out that leaves a scheduled follow-up in the queue is not an opt-out.
 */
export async function suppress(params: {
  organizationId: string;
  value: string;
  scope?: SuppressionScope;
  reason: SuppressionReason;
  note?: string;
}) {
  const value = params.value.toLowerCase().trim();
  const scope = params.scope ?? 'EMAIL';

  const entry = await db.suppression.upsert({
    where: { organizationId_scope_value: { organizationId: params.organizationId, scope, value } },
    create: { organizationId: params.organizationId, scope, value, reason: params.reason, note: params.note },
    update: { reason: params.reason, note: params.note },
  });

  const contacts = await db.contact.findMany({
    // Stored addresses keep whatever case they were imported with; suppression
    // values are lowercased. Match insensitively or a mixed-case contact keeps
    // its queued follow-ups.
    where: scope === 'EMAIL'
      ? { organizationId: params.organizationId, email: { equals: value, mode: 'insensitive' } }
      : { organizationId: params.organizationId, email: { endsWith: `@${value}`, mode: 'insensitive' } },
    select: { id: true, leadId: true },
  });

  if (contacts.length) {
    const leadIds = [...new Set(contacts.map((c) => c.leadId))];
    await db.$transaction([
      db.message.updateMany({
        where: {
          contactId: { in: contacts.map((c) => c.id) },
          status: { in: ['GENERATING', 'DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] },
        },
        data: { status: 'CANCELLED', failureReason: `Suppressed: ${params.reason}` },
      }),
      db.campaignEnrollment.updateMany({
        where: { leadId: { in: leadIds }, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
        data: { status: 'OPTED_OUT', exitReason: params.reason, completedAt: new Date(), nextActionAt: null },
      }),
      db.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { status: 'SUPPRESSED', suppressedAt: new Date(), suppressReason: params.reason, nextFollowUpAt: null },
      }),
    ]);

    for (const leadId of leadIds) {
      await logActivity({
        organizationId: params.organizationId, leadId, type: 'SYSTEM',
        title: 'Added to do-not-contact',
        body: `${value} — ${params.reason.toLowerCase().replace(/_/g, ' ')}. Queued messages and follow-ups cancelled.`,
      });
    }
  }

  return { entry, cancelledContacts: contacts.length };
}

export async function isSuppressed(organizationId: string, email: string) {
  const normalized = email.toLowerCase().trim();
  const domain = normalized.split('@')[1] ?? '';
  return db.suppression.findFirst({
    where: { organizationId, OR: [{ scope: 'EMAIL', value: normalized }, { scope: 'DOMAIN', value: domain }] },
  });
}
