import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Plug } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';
import { SolutionDemo } from '@/components/solutions/solution-demo';
import { solutionSpecSchema } from '@/server/services/templates/spec';

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission('lead:read');

  const candidates = await db.solutionTemplate.findMany({
    where: { slug, OR: [{ organizationId: null }, { organizationId: session.organizationId }] },
  });
  const template = candidates.find((t) => t.organizationId) ?? candidates[0];
  if (!template) notFound();

  const parsed = solutionSpecSchema.safeParse(template.spec);
  if (!parsed.success) notFound();
  const spec = parsed.data;

  return (
    <>
      <Topbar title={template.title} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <Link href="/solutions" className="inline-flex items-center gap-1.5 text-micro text-muted hover:text-ink mb-5">
            <ArrowLeft className="size-3.5" /> Solution library
          </Link>

          <header className="mb-6">
            <span className="inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium mb-2"
                  style={{ background: `${template.accentColor}1a`, color: template.accentColor }}>
              {template.industry}
            </span>
            <h2 className="text-2xl font-semibold mb-2">{template.title}</h2>
            <p className="text-sm text-muted max-w-2xl">{template.description}</p>
          </header>

          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            <div className="card p-4">
              <h3 className="eyebrow mb-1.5">The problem it addresses</h3>
              <p className="text-micro leading-relaxed">{spec.problem}</p>
            </div>
            <div className="card p-4">
              <h3 className="eyebrow mb-1.5">What changes</h3>
              <p className="text-micro leading-relaxed">{spec.outcome}</p>
            </div>
          </div>

          <SolutionDemo spec={spec} accent={template.accentColor} title={template.title} />

          <div className="grid sm:grid-cols-2 gap-3 mt-6">
            <div className="card p-4">
              <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                <Clock className="size-3" /> Typical build
              </h3>
              <p className="num text-[15px] font-medium mb-2">{spec.buildEstimate.weeks}</p>
              <ol className="space-y-1">
                {spec.buildEstimate.phases.map((phase, i) => (
                  <li key={phase} className="text-[11px] text-muted flex gap-2">
                    <span className="num shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    {phase}
                  </li>
                ))}
              </ol>
            </div>
            <div className="card p-4">
              <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                <Plug className="size-3" /> Connects to
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {spec.integrations.map((integration) => (
                  <span key={integration}
                        className="text-[11px] px-2 h-[22px] inline-flex items-center rounded-full bg-raised text-muted">
                    {integration}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
