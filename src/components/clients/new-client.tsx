'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { ClientProfileForm, profilePayload, profileValuesFrom } from './client-profile-form';

export function NewClient() {
  const router = useRouter();
  const create = trpc.clients.create.useMutation({ onSuccess: (c) => { router.push(`/clients/${c.id}?tab=offers`); router.refresh(); } });
  return (
    <>
      <Topbar title="New client" showClientSwitcher={false} />
      <PageBody width="narrow">
        <p className="text-sm text-muted mb-6">
          Start with the business profile. Next you&apos;ll add what they sell (an offer), who they sell to (an ideal customer
          profile), and proof points they&apos;re happy to have quoted.
        </p>
        <div className="card p-5">
          <ClientProfileForm initial={profileValuesFrom(null, true)} internal submitLabel="Create client"
                             pending={create.isPending} error={create.error} onSubmit={(v) => create.mutate(profilePayload(v))} />
        </div>
      </PageBody>
    </>
  );
}
