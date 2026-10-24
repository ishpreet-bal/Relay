import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ClientDetail } from '@/components/clients/client-detail';

export const metadata = { title: 'Client' };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('clientProfile:write');
  return (
    <Suspense>
      <ClientDetail id={id} canEdit={can(session.role, 'clientProfile:write')} canManage={can(session.role, 'client:manage')}
                    canPortal={can(session.role, 'portal:read')} />
    </Suspense>
  );
}
