import { pageSession } from '@/lib/page-auth';
import { isCapabilityAvailable } from '@/server/connectors/registry';
import { AssistantPage } from '@/components/assistant/assistant-page';

export const metadata = { title: 'Ask Relay' };

export default async function Page() {
  const session = await pageSession('account:read');
  return <AssistantPage aiConfigured={await isCapabilityAvailable(session.organizationId, 'AI')} />;
}
