import { pageSession } from '@/lib/page-auth';
import { GuideWorkspace } from '@/components/onboarding/guide-workspace';
export const metadata = { title: 'Start here' };
export default async function PortalGuidePage() {
  const session = await pageSession('portal:read');
  return <GuideWorkspace role={session.role} />;
}
