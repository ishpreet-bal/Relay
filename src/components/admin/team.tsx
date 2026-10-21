'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { Role } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { CLIENT_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Field } from '@/components/ui/field';
import { ErrorNote, Loading } from '@/components/ui/states';

const ROLES: Role[] = ['SUPER_ADMIN', 'RELAY_ADMIN', 'OPERATOR', 'ANALYST', 'CALLER', 'CLIENT_ADMIN', 'CLIENT_MEMBER'];
type Member = RouterOutputs['team']['members'][number];

/**
 * Roles are owned by Relay, not by the identity provider. Client roles must
 * be tied to exactly one client; internal roles never are.
 */
export function TeamPage({ currentUserId }: { currentUserId: string }) {
  const members = trpc.team.members.useQuery();
  const internal = (members.data ?? []).filter((m) => !CLIENT_ROLES.includes(m.role));
  const clientUsers = (members.data ?? []).filter((m) => CLIENT_ROLES.includes(m.role));

  return (
    <>
      <Topbar title="Team" showClientSwitcher={false} />
      <PageBody className="space-y-8">
        <Invite />
        <ErrorNote error={members.error} />
        {members.isPending ? <Loading /> : (
          <>
            <Section title={`Relay team (${internal.length})`}>
              <ul className="card divide-y divide-hairline">{internal.map((m) => <MemberRow key={m.id} m={m} self={m.user.id === currentUserId} />)}</ul>
            </Section>
            <Section title={`Client users (${clientUsers.length})`} hint="They see only their own company's portal: results, meetings, campaigns and their business profile.">
              {clientUsers.length ? (
                <ul className="card divide-y divide-hairline">{clientUsers.map((m) => <MemberRow key={m.id} m={m} self={m.user.id === currentUserId} />)}</ul>
              ) : <p className="text-micro text-muted">No client users yet.</p>}
            </Section>
          </>
        )}
        <Section title="What each role can do">
          <dl className="card p-4 grid sm:grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-micro">
            {ROLES.map((r) => <div key={r} className="contents"><dt className="font-medium">{ROLE_LABELS[r]}</dt><dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd></div>)}
          </dl>
        </Section>
      </PageBody>
    </>
  );
}

function MemberRow({ m, self }: { m: Member; self: boolean }) {
  const { clients } = useActiveClient();
  const [role, setRole] = useState<Role>(m.role);
  const [clientId, setClientId] = useState(m.client?.id ?? '');
  const utils = trpc.useUtils();
  const update = trpc.team.update.useMutation({ onSuccess: () => utils.team.members.invalidate() });
  const isClientRole = CLIENT_ROLES.includes(role);
  const dirty = role !== m.role || (isClientRole && clientId !== (m.client?.id ?? ''));

  return (
    <li className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate">{[m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email}{self && <span className="text-muted font-normal"> (you)</span>}</p>
        <p className="text-[11px] text-muted truncate">{m.user.email}</p>
      </div>
      <select aria-label="Role" className="input h-8 w-40 text-micro" value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      {isClientRole && (
        <select aria-label="Client" className="input h-8 w-48 text-micro" value={clientId} disabled={self} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Not connected yet</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {dirty && (
        <button type="button" className="btn-primary h-8 text-micro" disabled={update.isPending}
                onClick={() => update.mutate({ membershipId: m.id, role, clientId: isClientRole ? clientId || null : null })}>Save</button>
      )}
      <ErrorNote error={update.error} className="sm:basis-full" />
    </li>
  );
}

function Invite() {
  const { clients } = useActiveClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('CALLER');
  const [clientId, setClientId] = useState('');
  const invite = trpc.team.invite.useMutation({ onSuccess: () => setEmail('') });
  const isClientRole = CLIENT_ROLES.includes(role);

  return (
    <Section title="Invite someone">
      <form className="card p-4 flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        invite.mutate({ email, role, clientId: isClientRole ? clientId || null : null });
      }}>
        <Field label="Email" className="flex-1 min-w-[200px]">{(id) => <input id={id} type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Role">
          {(id) => (
            <select id={id} className="input w-44" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          )}
        </Field>
        {isClientRole && (
          <Field label="Client">
            {(id) => (
              <select id={id} required className="input w-48" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <button type="submit" className="btn-primary" disabled={invite.isPending}><UserPlus className="size-3.5" /> {invite.isPending ? 'Sending…' : 'Send invite'}</button>
        {invite.data && <p className="basis-full text-[12px] text-cleared">Invitation sent to {invite.data.email}. Their role applies when they accept.</p>}
        <ErrorNote error={invite.error} className="basis-full" />
      </form>
    </Section>
  );
}
