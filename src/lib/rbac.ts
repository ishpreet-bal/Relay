import type { Role } from '@prisma/client';

/**
 * Permissions are explicit strings rather than role checks scattered through
 * the codebase — adding a role means editing one table, not 40 call sites.
 *
 * A permission says what kind of action a role may take. *Which* rows it may
 * take it on is decided separately by the access scope (src/server/access):
 * internal roles work across every client in the workspace, client roles only
 * ever see their own client.
 */
export const PERMISSIONS = [
  // Clients and how we sell for them
  'client:read', 'client:manage', 'clientProfile:write',
  'playbook:read', 'playbook:write',
  // Prospects
  'account:read', 'account:write', 'account:delete', 'account:import', 'account:override',
  'research:read', 'research:run',
  // Email outreach
  'message:read', 'message:draft', 'message:approve', 'message:send',
  'campaign:read', 'campaign:write', 'campaign:activate',
  // Calling and meetings
  'call:read', 'call:log', 'call:assign',
  'meeting:read', 'meeting:write',
  // Compliance
  'suppression:read', 'suppression:write',
  // Reporting
  'analytics:read', 'portal:read',
  // Operations
  'ops:read', 'connector:manage',
  // Studio: customer applications
  'studio:read', 'studio:write', 'studio:run', 'studio:deploy', 'studio:secrets',
  // Legacy agency tooling (proposals, demo sites)
  'proposal:read', 'proposal:write', 'proposal:send',
  'portfolio:read', 'portfolio:write', 'portfolio:publish',
  // Workspace
  'settings:read', 'settings:write', 'billing:manage', 'member:manage', 'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Client users see results, not machinery. */
const CLIENT_MEMBER: Permission[] = ['portal:read', 'client:read', 'studio:read', 'studio:run'];

/** A customer's admin can also connect their own systems to their applications. */
const CLIENT_ADMIN: Permission[] = [...CLIENT_MEMBER, 'clientProfile:write', 'studio:secrets'];

/** Callers get exactly what a sales conversation needs. */
const CALLER: Permission[] = [
  'client:read', 'playbook:read', 'account:read', 'research:read',
  'call:read', 'call:log', 'meeting:read', 'meeting:write',
];

const ANALYST: Permission[] = [
  ...CALLER,
  'account:write', 'account:import', 'research:run',
  'message:read', 'message:draft', 'campaign:read', 'campaign:write',
  'suppression:read', 'analytics:read', 'ops:read',
  'proposal:read', 'portfolio:read', 'settings:read',
  'studio:read', 'studio:run',
];

// Only OPERATOR and above can put mail on the wire or change what the system
// is allowed to say without review.
const OPERATOR: Permission[] = [
  ...ANALYST,
  'message:approve', 'message:send', 'campaign:activate',
  'call:assign', 'suppression:write', 'account:override',
  'clientProfile:write', 'playbook:write', 'portal:read',
  'proposal:write', 'proposal:send', 'portfolio:write', 'portfolio:publish',
  'studio:write',
];

const RELAY_ADMIN: Permission[] = [
  ...OPERATOR,
  'client:manage', 'account:delete', 'settings:write', 'member:manage',
  'audit:read', 'connector:manage',
  // Production deployments and customer credentials stay with admins.
  'studio:deploy', 'studio:secrets',
];

const SUPER_ADMIN: Permission[] = [...RELAY_ADMIN, 'billing:manage'];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(SUPER_ADMIN),
  RELAY_ADMIN: new Set(RELAY_ADMIN),
  OPERATOR: new Set(OPERATOR),
  ANALYST: new Set(ANALYST),
  CALLER: new Set(CALLER),
  CLIENT_ADMIN: new Set(CLIENT_ADMIN),
  CLIENT_MEMBER: new Set(CLIENT_MEMBER),
};

export const INTERNAL_ROLES: readonly Role[] = ['SUPER_ADMIN', 'RELAY_ADMIN', 'OPERATOR', 'ANALYST', 'CALLER'];
export const CLIENT_ROLES: readonly Role[] = ['CLIENT_ADMIN', 'CLIENT_MEMBER'];

/** Staff roles an owner can limit to chosen clients. Admins always work across all of them. */
export const SCOPABLE_ROLES: readonly Role[] = ['OPERATOR', 'ANALYST', 'CALLER'];

/**
 * Permissions that act on the whole workspace rather than on one client's
 * records (queues, connectors, settings, team, billing, audit). Staff
 * limited to some clients do not get them, whatever their role.
 */
export const WORKSPACE_WIDE: ReadonlySet<Permission> = new Set<Permission>([
  'ops:read', 'connector:manage', 'settings:read', 'settings:write', 'member:manage', 'billing:manage', 'audit:read', 'client:manage',
]);

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Owner',
  RELAY_ADMIN: 'Admin',
  OPERATOR: 'Operator',
  ANALYST: 'Analyst',
  CALLER: 'Caller',
  CLIENT_ADMIN: 'Client admin',
  CLIENT_MEMBER: 'Client member',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'Everything, including billing and the team.',
  RELAY_ADMIN: 'Runs operations across every client.',
  OPERATOR: 'Runs campaigns: approves and sends, manages prospects. Can be limited to chosen clients.',
  ANALYST: 'Research, enrichment and drafting. Cannot send. Can be limited to chosen clients.',
  CALLER: 'Call queue, call outcomes and meeting booking. Can be limited to chosen clients.',
  CLIENT_ADMIN: 'Client portal, plus their business profile, offers and ICPs.',
  CLIENT_MEMBER: 'Client portal, read only.',
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission | string) {
    super(`Missing permission: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
