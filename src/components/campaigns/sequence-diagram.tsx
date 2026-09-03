import { Mail, Clock } from 'lucide-react';

/**
 * The sequence rendered as a horizontal spine. Delays are labelled in human
 * units between the steps rather than inside them, because the gap is the thing
 * operators actually tune — "30 days" is the decision, the email is the detail.
 */
export function SequenceDiagram({ steps }: {
  steps: Array<{ id: string; order: number; purpose: string; delayHours: number; stopOnReply: boolean }>;
}) {
  return (
    <ol className="flex items-stretch gap-0 overflow-x-auto pb-1">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-stretch shrink-0">
          {i > 0 && (
            <div className="flex flex-col items-center justify-center px-3 min-w-[86px]">
              <div className="w-full h-px bg-hairline" />
              <span className="num text-[10px] text-muted mt-1 flex items-center gap-1 whitespace-nowrap">
                <Clock className="size-2.5" />
                {humanDelay(step.delayHours)}
              </span>
            </div>
          )}
          <div className="rounded-card border border-hairline bg-surface p-3 w-[168px]">
            <div className="flex items-center gap-1.5 mb-1">
              <Mail className="size-3 text-accent" strokeWidth={2} />
              <span className="num text-[10px] text-muted">step {step.order + 1}</span>
            </div>
            <p className="text-micro font-medium capitalize">{step.purpose.replace(/-/g, ' ')}</p>
            {step.stopOnReply && (
              <p className="text-[10px] text-cleared mt-1.5">Stops on reply</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function humanDelay(hours: number) {
  if (hours === 0) return 'immediately';
  if (hours < 48) return `${hours}h later`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d later`;
  return `${Math.round(days / 7)}w later`;
}
