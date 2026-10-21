import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { assertClientAccess, clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { logActivity } from '@/server/services/activity';
import { rescoreAccount } from '@/server/services/scoring';
import { fillableFields } from './match';
import { normalizeCompanyName } from './normalize';

/**
 * Merges one account into another. Nothing is lost: every contact, email,
 * call, meeting, signal, note and source record moves to the kept account;
 * empty fields on the kept account are filled from the other; the merged
 * account is archived with a pointer to where it went.
 *
 * Contacts that are the same person (same email) are folded together, and
 * their history follows them, so a person never ends up in two sequences or
 * two call-queue entries.
 */

const FILLABLE = [
  'websiteUrl', 'linkedinUrl', 'phone', 'industry', 'naicsCode', 'employeeCount', 'employeeRange', 'revenueRange',
  'description', 'businessModel', 'foundedYear', 'addressLine', 'city', 'region', 'postalCode', 'latitude', 'longitude',
  'timezone', 'legalName', 'researchSummary', 'estimatedValueCents', 'ownerId', 'icpId',
] as const;

export async function mergeAccounts(access: AccessContext, userId: string, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new DomainError('Choose two different accounts.');
  const [keep, merge] = await Promise.all([
    db.account.findFirst({ where: { id: keepId, ...clientFilter(access), deletedAt: null } }),
    db.account.findFirst({ where: { id: mergeId, ...clientFilter(access), deletedAt: null } }),
  ]);
  if (!keep || !merge) throw new NotFoundError('Account');
  if (keep.clientId !== merge.clientId) throw new DomainError('Accounts belong to different clients and cannot be merged.');
  assertClientAccess(access, keep.clientId);

  await db.$transaction(async (tx) => {
    // The merged record gives up its domain first, so the kept one may take it.
    await tx.account.update({ where: { id: merge.id }, data: { domain: null } });

    const patch = fillableFields(keep, merge, FILLABLE) as Prisma.AccountUncheckedUpdateInput;
    if (!keep.domain && merge.domain) { patch.domain = merge.domain; patch.websiteUrl ??= merge.websiteUrl; }
    await tx.account.update({
      where: { id: keep.id },
      data: {
        ...patch,
        normalizedName: keep.normalizedName ?? normalizeCompanyName(keep.name),
        tags: [...new Set([...keep.tags, ...merge.tags])],
        keywords: [...new Set([...keep.keywords, ...merge.keywords])],
        techStack: [...new Set([...keep.techStack, ...merge.techStack])],
        socialProfiles: { ...((merge.socialProfiles as object | null) ?? {}), ...((keep.socialProfiles as object | null) ?? {}) },
        doNotContact: keep.doNotContact || merge.doNotContact,
      },
    });

    await mergeContacts(tx, keep.id, merge.id);

    const move = { where: { accountId: merge.id }, data: { accountId: keep.id } };
    await tx.activity.updateMany(move);
    await tx.task.updateMany(move);
    await tx.message.updateMany(move);
    await tx.campaignEnrollment.updateMany(move);
    await tx.meeting.updateMany(move);
    await tx.signal.updateMany(move);
    await tx.call.updateMany(move);
    await tx.callTask.updateMany(move);
    await tx.proposal.updateMany(move);
    await tx.portfolioSite.updateMany(move);
    await tx.providerRecord.updateMany(move);
    await tx.usageRecord.updateMany(move);
    await tx.invoice.updateMany(move);
    await tx.discoveryIdentifier.updateMany(move);
    await tx.discoveryResult.updateMany(move);
    // Source history moves too; the kept account's current values stay current.
    await tx.dataProvenance.updateMany({ where: { accountId: merge.id }, data: { accountId: keep.id, isCurrent: false } });
    await tx.account.updateMany({ where: { parentAccountId: merge.id }, data: { parentAccountId: keep.id } });

    // Research: keep the more recent one.
    const [keepResearch, mergeResearch] = await Promise.all([
      tx.research.findUnique({ where: { accountId: keep.id }, select: { id: true, refreshedAt: true } }),
      tx.research.findUnique({ where: { accountId: merge.id }, select: { id: true, refreshedAt: true } }),
    ]);
    if (mergeResearch) {
      const mergeIsNewer = !keepResearch || (mergeResearch.refreshedAt?.getTime() ?? 0) > (keepResearch.refreshedAt?.getTime() ?? 0);
      if (mergeIsNewer) {
        if (keepResearch) await tx.research.delete({ where: { id: keepResearch.id } });
        await tx.research.update({ where: { id: mergeResearch.id }, data: { accountId: keep.id } });
      } else {
        await tx.research.delete({ where: { id: mergeResearch.id } });
      }
    }

    await tx.duplicateCandidate.updateMany({
      where: { status: 'OPEN', OR: [{ accountId: merge.id }, { candidateId: merge.id }] },
      data: { status: 'MERGED', resolvedById: userId, resolvedAt: new Date() },
    });
    await tx.account.update({ where: { id: merge.id }, data: { deletedAt: new Date(), mergedIntoId: keep.id, archiveReason: 'MERGED' } });

    await logActivity({
      organizationId: access.organizationId, clientId: keep.clientId, accountId: keep.id, userId, type: 'SYSTEM',
      title: `Merged with ${merge.name}`,
      body: Object.keys(patch).length ? `Filled from the merged record: ${Object.keys(patch).join(', ')}.` : null,
      metadata: { mergedAccountId: merge.id },
      tx,
    });
  });

  await rescoreAccount(keep.id);
  return { keptId: keep.id, mergedId: merge.id };
}

/**
 * Contacts move with their account; two records for the same email become
 * one. The kept contact's details win, gaps are filled from the other, and
 * the duplicate's history is repointed before it is archived.
 */
async function mergeContacts(tx: Prisma.TransactionClient, keepAccountId: string, mergeAccountId: string) {
  const [keepContacts, mergeContacts] = await Promise.all([
    tx.contact.findMany({ where: { accountId: keepAccountId } }),
    tx.contact.findMany({ where: { accountId: mergeAccountId } }),
  ]);
  const byEmail = new Map(keepContacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));

  for (const dup of mergeContacts) {
    const twin = dup.email ? byEmail.get(dup.email.toLowerCase()) : undefined;
    if (!twin) {
      await tx.contact.update({ where: { id: dup.id }, data: { accountId: keepAccountId, isPrimary: false } });
      continue;
    }

    const fill = fillableFields(twin, dup, [
      'firstName', 'lastName', 'title', 'department', 'phone', 'directPhone', 'mobilePhone', 'linkedinUrl', 'city', 'region', 'timezone',
    ] as const) as Prisma.ContactUncheckedUpdateInput;
    await tx.contact.update({
      where: { id: twin.id },
      data: {
        ...fill,
        // Any opt-out on either record applies to the person.
        doNotEmail: twin.doNotEmail || dup.doNotEmail,
        doNotCall: twin.doNotCall || dup.doNotCall,
        unsubscribedAt: twin.unsubscribedAt ?? dup.unsubscribedAt,
        callAttempts: twin.callAttempts + dup.callAttempts,
      },
    });

    const repoint = { where: { contactId: dup.id }, data: { contactId: twin.id } };
    await tx.message.updateMany(repoint);
    await tx.call.updateMany(repoint);
    await tx.meeting.updateMany(repoint);
    await tx.activity.updateMany(repoint);
    await tx.providerRecord.updateMany(repoint);
    await tx.usageRecord.updateMany(repoint);
    await tx.suppression.updateMany(repoint);
    await tx.dataProvenance.updateMany({ where: { contactId: dup.id }, data: { contactId: twin.id, isCurrent: false } });

    // One live sequence and one queue entry per person.
    const twinCampaigns = new Set((await tx.campaignEnrollment.findMany({ where: { contactId: twin.id }, select: { campaignId: true } })).map((e) => e.campaignId));
    const dupEnrollments = await tx.campaignEnrollment.findMany({ where: { contactId: dup.id }, select: { id: true, campaignId: true } });
    for (const e of dupEnrollments) {
      if (twinCampaigns.has(e.campaignId)) await tx.campaignEnrollment.delete({ where: { id: e.id } });
      else await tx.campaignEnrollment.update({ where: { id: e.id }, data: { contactId: twin.id, accountId: keepAccountId } });
    }
    const twinTask = await tx.callTask.findUnique({ where: { contactId: twin.id }, select: { id: true } });
    if (twinTask) await tx.callTask.deleteMany({ where: { contactId: dup.id } });
    else await tx.callTask.updateMany({ where: { contactId: dup.id }, data: { contactId: twin.id, accountId: keepAccountId } });

    // The duplicate gives up its email (unique per account) and is archived.
    await tx.contact.update({ where: { id: dup.id }, data: { accountId: keepAccountId, email: null, deletedAt: new Date(), isPrimary: false } });
  }
}

const openWhere = (access: AccessContext, clientId?: string | null): Prisma.DuplicateCandidateWhereInput => ({
  ...clientFilter(access, clientId), status: 'OPEN', account: { deletedAt: null }, candidate: { deletedAt: null },
});

/** Open possible-duplicate pairs for review. */
export function listDuplicateCandidates(access: AccessContext, clientId?: string | null) {
  return db.duplicateCandidate.findMany({
    where: openWhere(access, clientId),
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      account: { select: ACCOUNT_SUMMARY },
      candidate: { select: ACCOUNT_SUMMARY },
    },
  });
}

export function countDuplicateCandidates(access: AccessContext, clientId?: string | null) {
  return db.duplicateCandidate.count({ where: openWhere(access, clientId) });
}

/** Open pairs one account is part of, for the banner on its page. */
export function duplicatesForAccount(access: AccessContext, accountId: string) {
  return db.duplicateCandidate.findMany({
    where: { ...openWhere(access), OR: [{ accountId }, { candidateId: accountId }] },
    orderBy: { score: 'desc' },
    take: 5,
    select: {
      id: true, score: true,
      account: { select: { id: true, name: true } },
      candidate: { select: { id: true, name: true } },
    },
  });
}

const ACCOUNT_SUMMARY = {
  id: true, name: true, domain: true, websiteUrl: true, phone: true, addressLine: true, city: true, region: true,
  industry: true, source: true, createdAt: true, deletedAt: true, score: true,
  _count: { select: { contacts: { where: { deletedAt: null } }, messages: true, calls: true } },
} satisfies Prisma.AccountSelect;

export async function dismissDuplicate(access: AccessContext, userId: string, id: string) {
  const row = await db.duplicateCandidate.findFirst({ where: { id, organizationId: access.organizationId } });
  if (!row) throw new NotFoundError('Duplicate');
  assertClientAccess(access, row.clientId);
  return db.duplicateCandidate.update({ where: { id }, data: { status: 'DISMISSED', resolvedById: userId, resolvedAt: new Date() } });
}
