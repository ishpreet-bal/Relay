import { pageSession } from '@/lib/page-auth';
import { GuideWorkspace } from '@/components/onboarding/guide-workspace';
export const metadata = { title: 'Start here' };
export default async function GuidePage() {
  const session = await pageSession('account:read');
  return <GuideWorkspace role={session.role} />;
}
