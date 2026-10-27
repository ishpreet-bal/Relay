import { pageSession } from '@/lib/page-auth';
import { PageBody } from '@/components/ui/page';
import { Topbar } from '@/components/shell/topbar';
import { ResearchQueue } from '@/components/research/research-queue';
import { monthlySpend } from '@/server/ai/budget';

export const metadata = { title: 'Research' };

export default async function ResearchPage() {
  const session = await pageSession('research:read');
  const spend = await monthlySpend(session.organizationId);

  return (
    <>
      <Topbar title="Research" />
      <PageBody width="narrow">
        <BudgetBar spentCents={spend.spentCents} capCents={spend.capCents} runs={spend.runs} />
        <ResearchQueue />
      </PageBody>
    </>
  );
}

function BudgetBar({ spentCents, capCents, runs }: { spentCents: number; capCents: number; runs: number }) {
  const pct = Math.min(100, (spentCents / capCents) * 100);
  const tone = pct > 100 ? 'bg-blocked' : pct > 80 ? 'bg-held' : 'bg-cleared';

  return (
    <section className="card p-4 mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="eyebrow">AI spend this month</h2>
        <p className="num text-micro text-muted">
          ${(spentCents / 100).toFixed(2)} of ${(capCents / 100).toFixed(2)} · {runs} runs
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
        <div className={`h-full ${tone} animate-meter-fill origin-left`} style={{ width: `${pct}%` }} />
      </div>
      {pct > 80 && (
        <p className="text-[11px] text-held mt-2">
          Nearing the cap. Research jobs pause automatically at 100% and resume when the cap resets or is raised in Settings.
        </p>
      )}
    </section>
  );
}
