'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';

export interface ClientOption { id: string; name: string; status: string }

interface ActiveClient {
  clientId: string | null;
  clients: ClientOption[];
  activeClient: ClientOption | null;
  setClientId: (id: string | null) => void;
}

const Ctx = createContext<ActiveClient>({ clientId: null, clients: [], activeClient: null, setClientId: () => {} });

const COOKIE = 'fdy_client';

/**
 * The client an internal user is focused on. Stored in a cookie so server
 * components see the same selection; every server read re-validates it.
 */
export function ActiveClientProvider({ initialClientId, clients, children }: {
  initialClientId: string | null;
  clients: ClientOption[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const setClientId = useCallback((id: string | null) => {
    document.cookie = id
      ? `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`
      : `${COOKIE}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  }, [router]);

  const value = useMemo(() => ({
    clientId: initialClientId,
    clients,
    activeClient: clients.find((c) => c.id === initialClientId) ?? null,
    setClientId,
  }), [initialClientId, clients, setClientId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveClient() {
  return useContext(Ctx);
}
