import { cn } from '@/lib/utils';
import type { PersonalizationTier } from '@prisma/client';

/**
 * The tier badge is the most important label in the review queue. It answers
 * "does this email actually know anything about them?" before the operator
 * reads a word, and it's what the queue sorts and filters by.
 */
const CONFIG: Record<PersonalizationTier, { label: string; tone: string; title: string }> = {
  VERIFIED: {
    label: 'Researched',
    tone: 'bg-cleared/12 text-cleared',
    title: 'Every specific claim traces to a verified quote from their website.',
  },
  CONTEXTUAL: {
    label: 'Industry only',
    tone: 'bg-held/12 text-held',
    title: 'Research found nothing usable. This email speaks to their industry and city, and makes no claims about their business.',
  },
  NONE: {
    label: 'Unpersonalized',
    tone: 'bg-blocked/10 text-blocked',
    title: 'No personalization. Not eligible to send.',
  },
};

export function TierBadge({ tier, className }: { tier: PersonalizationTier; className?: string }) {
  const c = CONFIG[tier];
  return (
    <span title={c.title}
          className={cn('inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap', c.tone, className)}>
      {c.label}
    </span>
  );
}
