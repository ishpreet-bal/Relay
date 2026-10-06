'use client';

import { Building2 } from 'lucide-react';
import { useActiveClient } from './active-client';

/** Scopes every list in the workspace to one client, or shows all of them. */
export function ClientSwitcher() {
  const { clientId, clients, setClientId } = useActiveClient();
  if (!clients.length) return null;
  return (
    <label className="relative flex items-center">
      <span className="sr-only">Client</span>
      <Building2 className="absolute left-2.5 size-3.5 text-muted pointer-events-none" strokeWidth={1.75} />
      <select
        value={clientId ?? ''}
        onChange={(e) => setClientId(e.target.value || null)}
        className="input h-8 w-48 pl-8 text-micro"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.status === 'PAUSED' ? ' (paused)' : ''}</option>
        ))}
      </select>
    </label>
  );
}
