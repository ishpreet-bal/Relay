import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { DraftWorkspace } from '@/components/drafts/draft-workspace';

export const metadata = { title: 'Drafts' };

export default async function DraftsPage() {
  const session = await requirePermission('message:read');
  return <DraftWorkspace canDraft={can(session.role, 'message:draft')} />;
}
