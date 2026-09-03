import { db } from '@/lib/db';
import { draftMessage, PersonalizeError } from '@/server/ai/personalize';
import { sendMessage } from './email';
import {
  windowFor, isWithinWindow, remainingDailyCapacity, scheduleNextStep, recordEnrollmentAdvance,
} from './campaigns';
import { BudgetExceededError } from '@/server/ai/budget';

/**
 * The sequencing engine. Runs on the worker, once per cycle, per organization.
 *
 * Its one hard rule: this code drafts and schedules, but the only messages it
 * ever puts on the wire are ones a human already approved. A follow-up that
 * comes due generates a draft into the review queue — it does not send itself.
 * That is the difference between this and every mass-mail tool, and it is
 * enforced structurally: sendDue() only ever queries status APPROVED/SCHEDULED.
 */

export interface SequencerResult {
  drafted: number;
  sent: number;
  blocked: number;
  skipped: Array<{ leadId: string; reason: string }>;
}

export async function runSequencer(organizationId: string): Promise<SequencerResult> {
  const result: SequencerResult = { drafted: 0, sent: 0, blocked: 0, skipped: [] };
  await draftDue(organizationId, result);
  await sendDue(organizationId, result);
  return result;
}

/** Generates drafts for enrollments whose next step has come due. */
async function draftDue(organizationId: string, result: SequencerResult) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });

  const campaigns = await db.campaign.findMany({
    where: { organizationId, status: 'ACTIVE' },
    include: { steps: { orderBy: { order: 'asc' } }, mailbox: true },
  });

  for (const campaign of campaigns) {
    const window = windowFor(campaign, org.timezone);
    // Outside the sending window we don't even draft. Drafting early would let
    // an eager operator approve and send at 11pm, defeating the window.
    if (!isWithinWindow(new Date(), window)) continue;

    const capacity = await remainingDailyCapacity(campaign);
    if (capacity.total <= 0) continue;

    const due = await db.campaignEnrollment.findMany({
      where: {
        campaignId: campaign.id,
        status: 'ACTIVE',
        nextActionAt: { lte: new Date() },
      },
      orderBy: { nextActionAt: 'asc' },
      take: Math.min(capacity.total, 25),
      include: { lead: { select: { id: true, suppressedAt: true, companyName: true } } },
    });

    for (const enrollment of due) {
      const step = campaign.steps.find((s) => s.order === enrollment.currentStep);
      if (!step) {
        await db.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'COMPLETED', completedAt: new Date(), nextActionAt: null },
        });
        continue;
      }

      if (enrollment.lead.suppressedAt) {
        await db.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'OPTED_OUT', exitReason: 'Suppressed', nextActionAt: null, completedAt: new Date() },
        });
        result.skipped.push({ leadId: enrollment.leadId, reason: 'Suppressed' });
        continue;
      }

      // A reply on any earlier message ends the sequence, even if the reply
      // arrived between cycles.
      if (step.stopOnReply) {
        const replied = await db.message.count({
          where: { leadId: enrollment.leadId, direction: 'INBOUND' },
        });
        if (replied > 0) {
          await db.campaignEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'REPLIED', exitReason: 'Replied', nextActionAt: null, completedAt: new Date() },
          });
          continue;
        }
      }

      try {
        const draft = await draftMessage({
          organizationId,
          leadId: enrollment.leadId,
          contactId: enrollment.contactId ?? undefined,
          campaignId: campaign.id,
          campaignStepId: step.id,
          senderName: campaign.mailbox?.fromName ?? org.brandName ?? org.name,
          offerBrief: campaign.offerBrief ?? '',
          toneGuidelines: campaign.toneGuidelines,
          bannedPhrases: campaign.bannedPhrases,
          stepPurpose: step.purpose,
          stepInstructions: step.instructions,
          allowContextual: campaign.allowContextual && capacity.contextual > 0,
        });

        if (draft.tier === 'CONTEXTUAL') capacity.contextual--;
        capacity.total--;
        result.drafted++;

        const nextAt = scheduleNextStep(campaign.steps, enrollment.currentStep, new Date(), window);
        await db.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStep: enrollment.currentStep + 1,
            nextActionAt: nextAt,
            ...(nextAt ? {} : { status: 'COMPLETED', completedAt: new Date() }),
          },
        });
        await db.lead.update({
          where: { id: enrollment.leadId },
          data: { nextFollowUpAt: nextAt },
        });
        await recordEnrollmentAdvance(organizationId, enrollment.leadId, step.purpose);
      } catch (err) {
        if (err instanceof BudgetExceededError) return; // Stop the whole cycle.

        if (err instanceof PersonalizeError) {
          // Non-retryable per-lead problems end the enrollment cleanly rather
          // than retrying every fifteen minutes forever.
          const terminal = err.code === 'NO_CONTACT' || err.code === 'SUPPRESSED';
          await db.campaignEnrollment.update({
            where: { id: enrollment.id },
            data: terminal
              ? { status: 'REMOVED', exitReason: err.message, nextActionAt: null, completedAt: new Date() }
              : { nextActionAt: new Date(Date.now() + 6 * 3600_000) },
          });
          result.skipped.push({ leadId: enrollment.leadId, reason: err.message });
          continue;
        }
        throw err;
      }
    }
  }
}

/**
 * Sends messages a human already approved and that are due. Approval is a
 * precondition of even appearing in this query.
 */
async function sendDue(organizationId: string, result: SequencerResult) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });

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
    take: 20,
    include: { campaign: true },
  });

  for (const message of due) {
    if (message.campaign) {
      const window = windowFor(message.campaign, org.timezone);
      if (!isWithinWindow(new Date(), window)) continue;
      if (message.campaign.status !== 'ACTIVE') continue;
    }

    try {
      const outcome = await sendMessage(message.id);
      if (outcome.sent) {
        result.sent++;
        // Pace the batch. The gate enforces a minimum gap; this keeps the
        // worker from hammering against it and logging a wall of refusals.
        await new Promise((r) => setTimeout(r, org.minMinutesBetweenSends * 60_000));
      } else {
        result.blocked++;
      }
    } catch {
      result.blocked++;
    }
  }
}
