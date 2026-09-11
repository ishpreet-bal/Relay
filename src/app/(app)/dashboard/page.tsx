import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';
import { DashboardOverview } from '@/components/dashboard/overview';
import { GettingStarted } from '@/components/dashboard/getting-started';

export const metadata = { title: 'Overview' };

const RESEARCHED = ['RESEARCHED', 'DRAFTED', 'APPROVED', 'CONTACTED', 'ENGAGED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'WON'] as const;
const SENT = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'] as const;

export default async function DashboardPage() {
  const session = await requirePermission('lead:read');
  const orgId = session.organizationId;

  const [leads, researched, drafts, sent, org] = await Promise.all([
    db.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
    db.lead.count({ where: { organizationId: orgId, deletedAt: null, status: { in: [...RESEARCHED] } } }),
    db.message.count({ where: { organizationId: orgId, direction: 'OUTBOUND' } }),
    db.message.count({ where: { organizationId: orgId, direction: 'OUTBOUND', status: { in: [...SENT] } } }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { offerBrief: true, defaultSenderName: true },
    }),
  ]);

  // The metrics below are all rates and totals; until something has actually
  // sent they are a wall of zeroes, which is worse than instructions.
  const showGuide = sent === 0;

  return (
    <>
      <Topbar title="Overview" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          {showGuide && (
            <GettingStarted
              progress={{
                leads,
                researched,
                drafts,
                sent,
                hasBrief: Boolean(org?.offerBrief?.trim() && org?.defaultSenderName?.trim()),
              }}
            />
          )}
          <DashboardOverview />
        </div>
      </div>
    </>
  );
}
