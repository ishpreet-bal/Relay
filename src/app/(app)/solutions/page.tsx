import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';

export const metadata = { title: 'Solution library' };

export default async function SolutionsPage() {
  const session = await requirePermission('lead:read');

  const templates = await db.solutionTemplate.findMany({
    where: {
      isPublished: true,
      OR: [{ organizationId: null }, { organizationId: session.organizationId }],
    },
    orderBy: { industry: 'asc' },
    select: {
      id: true, slug: true, industry: true, title: true, tagline: true,
      accentColor: true, organizationId: true,
    },
  });

  // A workspace fork shadows the built-in of the same slug.
  const bySlug = new Map<string, (typeof templates)[number]>();
  for (const t of templates) {
    const existing = bySlug.get(t.slug);
    if (!existing || t.organizationId) bySlug.set(t.slug, t);
  }
  const visible = [...bySlug.values()];

  return (
    <>
      <Topbar title="Solution library" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <p className="text-sm text-muted max-w-2xl mb-6">
            Working demos for each industry you sell into. Open one on a call, switch it
            to their vertical, and let the prospect see the dashboard rather than
            imagine it. Every demo runs on sample data and says so on screen.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((template) => (
              <Link
                key={template.id}
                href={`/solutions/${template.slug}`}
                className="card p-4 group hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className="inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium"
                    style={{ background: `${template.accentColor}1a`, color: template.accentColor }}
                  >
                    {template.industry}
                  </span>
                  <ArrowUpRight className="size-3.5 text-muted group-hover:text-accent transition-colors" />
                </div>
                <h2 className="text-[13px] font-medium mb-1">{template.title}</h2>
                <p className="text-[11px] text-muted leading-relaxed">{template.tagline}</p>
                {template.organizationId && (
                  <p className="eyebrow mt-2">customized</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
