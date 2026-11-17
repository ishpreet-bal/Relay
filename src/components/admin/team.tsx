'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { Role } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { CLIENT_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, SCOPABLE_ROLES } from '@/lib/rbac';
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

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Which clients an operator, analyst or caller works on. Nothing ticked means
 * every client. Limited staff also lose workspace-wide pages (queues,
 * connectors, settings, team, billing).
 */
function ClientScope({ value, onChange, disabled }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const { clients } = useActiveClient();
  const label = value.length === 0 ? 'All clients' : value.length === 1 ? (clients.find((c) => c.id === value[0])?.name ?? '1 client') : `${value.length} clients`;
  return (
    <details className="relative">
      <summary className={`input h-8 w-44 text-micro flex items-center cursor-pointer list-none ${disabled ? 'pointer-events-none opacity-60' : ''}`} aria-label="Clients this person works on">{label}</summary>
      <div className="absolute right-0 z-20 mt-1 w-64 card p-2 shadow-pop max-h-72 overflow-y-auto">
        <p className="px-1 pb-2 text-[11px] text-muted">Tick the clients they work on. None ticked means all clients.</p>
        {clients.map((c) => (
          <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 text-micro hover:bg-hairline/40">
            <input type="checkbox" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((v) => v !== c.id))} />
            <span className="truncate">{c.name}</span>
          </label>
        ))}
        {value.length > 0 && <button type="button" className="btn-ghost h-7 w-full text-micro mt-1" onClick={() => onChange([])}>All clients</button>}
      </div>
    </details>
  );
}

function MemberRow({ m, self }: { m: Member; self: boolean }) {
  const { clients } = useActiveClient();
  const [role, setRole] = useState<Role>(m.role);
  const [clientId, setClientId] = useState(m.client?.id ?? '');
  const [clientIds, setClientIds] = useState<string[]>(m.clientIds);
  const utils = trpc.useUtils();
  const update = trpc.team.update.useMutation({ onSuccess: () => utils.team.members.invalidate() });
  const isClientRole = CLIENT_ROLES.includes(role);
  const scopable = SCOPABLE_ROLES.includes(role);
  const dirty = role !== m.role || (isClientRole && clientId !== (m.client?.id ?? '')) || (scopable && !sameSet(clientIds, m.clientIds));

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
      {scopable && <ClientScope value={clientIds} onChange={setClientIds} disabled={self} />}
      {dirty && (
        <button type="button" className="btn-primary h-8 text-micro" disabled={update.isPending}
                onClick={() => update.mutate({ membershipId: m.id, role, clientId: isClientRole ? clientId || null : null, clientIds: scopable ? clientIds : [] })}>Save</button>
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
  const [clientIds, setClientIds] = useState<string[]>([]);
  const invite = trpc.team.invite.useMutation({ onSuccess: () => { setEmail(''); setClientIds([]); } });
  const isClientRole = CLIENT_ROLES.includes(role);
  const scopable = SCOPABLE_ROLES.includes(role);

  return (
    <Section title="Invite someone">
      <form className="card p-4 flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        invite.mutate({ email, role, clientId: isClientRole ? clientId || null : null, clientIds: scopable ? clientIds : [] });
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
        {scopable && <Field label="Works on">{() => <ClientScope value={clientIds} onChange={setClientIds} />}</Field>}
        <button type="submit" className="btn-primary" disabled={invite.isPending}><UserPlus className="size-3.5" /> {invite.isPending ? 'Sending…' : 'Send invite'}</button>
        {invite.data && <p className="basis-full text-[12px] text-cleared">Invitation sent to {invite.data.email}. Their role applies when they accept.</p>}
        <ErrorNote error={invite.error} className="basis-full" />
      </form>
    </Section>
  );
}
