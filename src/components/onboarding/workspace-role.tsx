'use client';
import { createContext, useContext } from 'react';
import type { Role } from '@prisma/client';
const RoleContext = createContext<Role | null>(null);
export const WorkspaceRoleProvider = RoleContext.Provider;
export function useWorkspaceRole() { return useContext(RoleContext); }
