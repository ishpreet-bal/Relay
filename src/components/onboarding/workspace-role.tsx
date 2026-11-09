'use client';
import { createContext, useContext } from 'react';
import type { Role } from '@prisma/client';
const RoleContext = createContext<Role | null>(null);
// A function component, not RoleContext.Provider itself: the workspace layout is a
// server component, and React 19 cannot render a bare context object sent from the server.
export function WorkspaceRoleProvider({ value, children }: { value: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
export function useWorkspaceRole() { return useContext(RoleContext); }
