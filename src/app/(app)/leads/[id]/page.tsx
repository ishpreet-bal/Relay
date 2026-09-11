import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, Linkedin, Phone, MapPin, Users2 } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';
import { Timeline } from '@/components/leads/timeline';
import { ScoreMeter, type ScoreSignal } from '@/components/leads/score-meter';
import { StatusPill } from '@/components/leads/status-pill';
import { ResearchReport } from '@/components/research/research-report';
import { DeliverablesPanel } from '@/components/proposals/deliverables-panel';
import { LeadDraftPanel } from '@/components/drafts/lead-draft-panel';
import { can } from '@/lib/rbac';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('lead:read');

  const lead = await db.lead.findFirst({
    where: { id, organizationId: session.organizationId, deletedAt: null },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' } },
    },
  });
  if (!lead) notFound();

  const signals = (lead.scoreBreakdown ?? []) as unknown as ScoreSignal[];

  return (
    <>
      <Topbar title={lead.companyName} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <Link href="/leads" className="inline-flex items-center gap-1.5 text-micro text-muted hover:text-ink mb-5">
            <ArrowLeft className="size-3.5" /> All leads
          </Link>

          <header className="flex items-start justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-semibold">{lead.companyName}</h2>
                <StatusPill status={lead.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted">
                {lead.industry && <span className="capitalize">{lead.industry}</span>}
                {(lead.city || lead.region) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />{[lead.city, lead.region].filter(Boolean).join(', ')}
                  </span>
                )}
                {(lead.employeeCount ?? lead.employeeRange) && (
                  <span className="inline-flex items-center gap-1">
                    <Users2 className="size-3" />
                    <span className="num">{lead.employeeCount ?? lead.employeeRange}</span> employees
                  </span>
                )}
                {lead.websiteUrl && (
                  <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 hover:text-accent">
                    <Globe className="size-3" />{lead.domain}
                  </a>
                )}
                {lead.linkedinUrl && (
                  <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 hover:text-accent">
                    <Linkedin className="size-3" />LinkedIn
                  </a>
                )}
                {lead.phone && (
                  <span className="inline-flex items-center gap-1 num"><Phone className="size-3" />{lead.phone}</span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="eyebrow mb-2">Lead score</p>
              <ScoreMeter score={lead.score} signals={signals} size="lg" />
            </div>
          </header>

          <div className="grid lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 space-y-8">
              <div>
                <h3 className="eyebrow mb-3">Research</h3>
                <ResearchReport leadId={lead.id} canRun={can(session.role, 'research:run')} />
              </div>
              <div>
                <h3 className="eyebrow mb-3">Activity</h3>
                <Timeline leadId={lead.id} />
              </div>
            </section>

            <aside className="space-y-5">
              <LeadDraftPanel leadId={lead.id} canDraft={can(session.role, 'message:draft')} />
              <DeliverablesPanel
                leadId={lead.id}
                canWrite={can(session.role, 'proposal:write')}
                hasResearch={lead.status === 'RESEARCHED' || lead.status === 'DRAFTED' || lead.status === 'CONTACTED' || lead.status === 'ENGAGED' || lead.status === 'PROPOSAL_SENT' || lead.status === 'MEETING_BOOKED'}
              />
              <section className="card p-4">
                <h3 className="eyebrow mb-3">Contacts</h3>
                {lead.contacts.length === 0 ? (
                  <p className="text-micro text-muted">
                    No contacts yet. Research will try to find a decision maker.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {lead.contacts.map((c) => (
                      <li key={c.id}>
                        <p className="text-[13px] font-medium">
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed contact'}
                          {c.isPrimary && <span className="eyebrow ml-2">primary</span>}
                        </p>
                        {c.title && <p className="text-micro text-muted">{c.title}</p>}
                        {c.email && (
                          <p className="num text-[11px] mt-0.5">
                            <span className={c.emailVerification === 'VALID' ? 'text-cleared' : 'text-muted'}>
                              {c.email}
                            </span>
                            <span className="text-muted"> · {c.emailVerification.toLowerCase().replace(/_/g, ' ')}</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>


              {lead.notes && (
                <section className="card p-4">
                  <h3 className="eyebrow mb-2">Notes</h3>
                  <p className="text-micro text-muted whitespace-pre-wrap">{lead.notes}</p>
                </section>
              )}
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
