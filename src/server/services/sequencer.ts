import { differenceInMinutes } from 'date-fns';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { draftMessage, PersonalizeError } from '@/server/ai/personalize';
import { BudgetExceededError } from '@/server/ai/budget';
import { NotConfiguredError } from '@/server/errors';
import { sendMessage } from './email';
import {
  windowFor, isWithinWindow, remainingDailyCapacity, scheduleNextStep, recordEnrollmentAdvance, exitEnrollment,
} from './campaigns';

/**
 * The sequencing engine. Runs on the worker, once per cycle, per workspace.
 *
 * Drafting: enrollments whose next step is due get a draft. Drafts that pass
 * verification in a campaign that allows automatic sending are approved by
 * policy; everything else waits in review.
 *
 * Sending: only approved messages are ever considered, and every one goes
 * through the send gate. Pacing is non-blocking — at most one send per
 * workspace per cycle, and only once the minimum gap since the last send has
 * passed — so one busy workspace never stalls the worker for the others.
 */

export interface SequencerResult {
  drafted: number;
  autoApproved: number;
  sent: number;
  blocked: number;
  skipped: Array<{ contactId: string | null; reason: string }>;
}

export async function runSequencer(organizationId: string): Promise<SequencerResult> {
  const result: SequencerResult = { drafted: 0, autoApproved: 0, sent: 0, blocked: 0, skipped: [] };
  await draftDue(organizationId, result);
  await sendDue(organizationId, result);
  return result;
}

async function draftDue(organizationId: string, result: SequencerResult) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const campaigns = await db.campaign.findMany({
    where: { organizationId, status: 'ACTIVE' },
    include: { steps: { orderBy: { order: 'asc' } }, client: { select: { timezone: true, archivedAt: true, status: true } } },
  });

  for (const campaign of campaigns) {
    if (campaign.client.archivedAt || campaign.client.status === 'PAUSED' || campaign.client.status === 'CHURNED') continue;
    const window = windowFor(campaign, campaign.client.timezone ?? org.timezone);
    // Outside the sending window we don't draft. Drafting early would let an
    // eager operator approve and send at 11pm, defeating the window.
    if (!isWithinWindow(new Date(), window)) continue;

    const capacity = await remainingDailyCapacity(campaign);
    if (capacity.total <= 0) continue;

    const due = await db.campaignEnrollment.findMany({
      where: { campaignId: campaign.id, status: 'ACTIVE', nextActionAt: { lte: new Date() } },
      orderBy: { nextActionAt: 'asc' },
      take: Math.min(capacity.total, 25),
      include: {
        account: { select: { id: true, doNotContact: true, deletedAt: true, status: true } },
        contact: { select: { id: true, doNotEmail: true, deletedAt: true } },
      },
    });

    for (const enrollment of due) {
      const step = campaign.steps.find((s) => s.order === enrollment.currentStep);
      const done = (status: 'COMPLETED' | 'OPTED_OUT' | 'REMOVED' | 'REPLIED', reason: string) =>
        db.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status, exitReason: reason, nextActionAt: null, completedAt: new Date() },
        });

      if (!step) { await done('COMPLETED', 'Sequence finished'); continue; }
      if (!enrollment.contact || enrollment.contact.deletedAt || enrollment.account.deletedAt) { await done('REMOVED', 'Contact removed'); continue; }
      if (enrollment.contact.doNotEmail || enrollment.account.doNotContact) {
        await done('OPTED_OUT', 'Do not contact');
        result.skipped.push({ contactId: enrollment.contactId, reason: 'Do not contact' });
        continue;
      }
      if (['WON', 'LOST', 'DISQUALIFIED', 'MEETING_BOOKED'].includes(enrollment.account.status)) {
        await done('COMPLETED', `Account ${enrollment.account.status.toLowerCase().replace('_', ' ')}`);
        continue;
      }

      // A reply from anyone at the account ends the sequence, even if it
      // arrived between cycles.
      if (step.stopOnReply) {
        const replied = await db.message.count({
          where: { accountId: enrollment.accountId, direction: 'INBOUND', createdAt: { gte: enrollment.enrolledAt } },
        });
        if (replied > 0) { await done('REPLIED', 'Replied'); continue; }
      }

      try {
        const draft = await draftMessage({
          organizationId,
          contactId: enrollment.contactId!,
          campaignId: campaign.id,
          campaignStepId: step.id,
          allowContextual: campaign.allowContextual && capacity.contextual > 0,
        });

        if (draft.tier === 'CONTEXTUAL') capacity.contextual--;
        capacity.total--;
        result.drafted++;
        if (draft.decision.autoApprove) result.autoApproved++;

        const nextAt = scheduleNextStep(campaign.steps, enrollment.currentStep, new Date(), window);
        await db.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStep: enrollment.currentStep + 1,
            nextActionAt: nextAt,
            ...(nextAt ? {} : { status: 'COMPLETED', completedAt: new Date() }),
          },
        });
        await db.account.update({ where: { id: enrollment.accountId }, data: { nextFollowUpAt: nextAt } });
        await recordEnrollmentAdvance({
          organizationId, clientId: campaign.clientId, accountId: enrollment.accountId, contactId: enrollment.contactId,
          campaignId: campaign.id, stepPurpose: step.purpose, autoApproved: draft.decision.autoApprove,
        });
        if (capacity.total <= 0) break;
      } catch (err) {
        if (err instanceof BudgetExceededError) return; // Stop the whole cycle.
        if (err instanceof PersonalizeError) {
          // Non-retryable per-contact problems end the enrollment cleanly
          // rather than retrying every cycle forever.
          const terminal = ['NO_CONTACT', 'NO_EMAIL', 'SUPPRESSED'].includes(err.code);
          await db.campaignEnrollment.update({
            where: { id: enrollment.id },
            data: terminal
              ? { status: 'REMOVED', exitReason: err.message, nextActionAt: null, completedAt: new Date() }
              : { nextActionAt: new Date(Date.now() + 6 * 3600_000) },
          });
          result.skipped.push({ contactId: enrollment.contactId, reason: err.message });
          continue;
        }
        throw err;
      }
    }
  }
}

/**
 * Sends one approved, due campaign message per cycle once the workspace's
 * minimum gap has passed. Approval — by a person or by policy — is a
 * precondition of even appearing in this query.
 */
async function sendDue(organizationId: string, result: SequencerResult) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const last = await db.message.findFirst({
    where: { organizationId, direction: 'OUTBOUND', sentAt: { not: null } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  if (last?.sentAt && differenceInMinutes(new Date(), last.sentAt) < org.minMinutesBetweenSends) return;

  const due = await db.message.findMany({
    where: {
      organizationId,
      direction: 'OUTBOUND',
      OR: [
        { status: 'SCHEDULED', scheduledFor: { lte: new Date() } },
        { status: 'APPROVED', campaignId: { not: null } },
      ],
    },
    orderBy: [{ scheduledFor: 'asc' }, { approvedAt: 'asc' }],
    take: 10,
    include: { campaign: { include: { client: { select: { timezone: true } } } } },
  });

  for (const message of due) {
    if (message.campaign) {
      if (message.campaign.status !== 'ACTIVE') continue;
      const window = windowFor(message.campaign, message.campaign.client.timezone ?? org.timezone);
      if (!isWithinWindow(new Date(), window)) continue;
    }
    try {
      const outcome = await sendMessage(message.id);
      if (outcome.sent) { result.sent++; return; }
      result.blocked++;
      // A message the gate will never pass should not block the queue.
      if (['SUPPRESSED', 'NO_RECIPIENT', 'UNVERIFIED_CLAIMS'].includes(outcome.verdict.allowed ? '' : outcome.verdict.code)) {
        await db.message.update({ where: { id: message.id }, data: { status: 'CANCELLED' } });
        if (message.contactId && !outcome.verdict.allowed && outcome.verdict.code === 'SUPPRESSED') {
          await exitEnrollment({ contactId: message.contactId, reason: 'OPTED_OUT', note: outcome.verdict.reason });
        }
      }
    } catch (err) {
      if (err instanceof NotConfiguredError) {
        logger.warn('sequencer.no_sender', { organizationId });
        return;
      }
      logger.error('sequencer.send_failed', { messageId: message.id, error: err });
      result.blocked++;
    }
  }
}
