import type { Role } from '@prisma/client';

/**
 * Permissions are explicit strings rather than role checks scattered through
 * the codebase — adding a role later means editing one table, not 40 call sites.
 */
export const PERMISSIONS = [
  'lead:read', 'lead:write', 'lead:delete', 'lead:import',
  'research:read', 'research:run',
  'message:read', 'message:draft', 'message:approve', 'message:send',
  'campaign:read', 'campaign:write', 'campaign:activate',
  'proposal:read', 'proposal:write', 'proposal:send',
  'portfolio:read', 'portfolio:write', 'portfolio:publish',
  'suppression:read', 'suppression:write',
  'settings:read', 'settings:write',
  'billing:manage',
  'member:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  'lead:read', 'research:read', 'message:read', 'campaign:read',
  'proposal:read', 'portfolio:read', 'suppression:read', 'settings:read',
];

const ANALYST: Permission[] = [
  ...VIEWER, 'lead:write', 'lead:import', 'research:run', 'message:draft',
  'campaign:write', 'proposal:write', 'portfolio:write',
];

// Only OPERATOR and above can put mail on the wire. Drafting is safe; sending
// is not, and the split is the whole point of the approval workflow.
const OPERATOR: Permission[] = [
  ...ANALYST, 'message:approve', 'message:send', 'campaign:activate',
  'proposal:send', 'portfolio:publish', 'suppression:write',
];

const ADMIN: Permission[] = [
  ...OPERATOR, 'lead:delete', 'settings:write', 'member:manage', 'audit:read',
];

const OWNER: Permission[] = [...ADMIN, 'billing:manage'];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  VIEWER, ANALYST, OPERATOR, ADMIN, OWNER,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
