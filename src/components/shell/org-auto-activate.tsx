'use client';

import { useEffect, useRef } from 'react';
import { useAuth, useOrganizationList } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

/**
 * Clerk tracks org membership separately from "active organization" on the
 * session — being a member of an org doesn't set orgId in auth(). Most users
 * only ever belong to one org, so there's no meaningful switch for them to
 * make; this activates it automatically instead of stranding them on
 * /onboarding until they click the switcher themselves.
 */
export function OrgAutoActivate() {
  const { isLoaded: authLoaded, userId, orgId } = useAuth();
  const { isLoaded: listLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const router = useRouter();
  const activating = useRef(false);

  useEffect(() => {
    if (!authLoaded || !listLoaded || !userId || orgId || activating.current) return;
    const first = userMemberships?.data?.[0]?.organization;
    if (!first || !setActive) return;

    activating.current = true;
    setActive({ organization: first.id })
      .then(() => router.refresh())
      .catch(() => {
        activating.current = false;
      });
  }, [authLoaded, listLoaded, userId, orgId, userMemberships, setActive, router]);

  return null;
}
