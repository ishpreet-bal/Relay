/**
 * Domain errors. Services throw these; the tRPC layer maps them to transport
 * codes in one place (server/trpc/init.ts), so a service never needs to know
 * whether it was called from a route, a page, or the worker.
 */

export class NotFoundError extends Error {
  constructor(entity: string) {
    // Deliberately says nothing about whether the row exists in another
    // tenant — "not found" and "not yours" must be indistinguishable.
    super(`${entity} not found`);
    this.name = 'NotFoundError';
  }
}

/** A request that is well-formed but not allowed in the current state. */
export class DomainError extends Error {
  constructor(message: string, public code = 'INVALID_STATE') {
    super(message);
    this.name = 'DomainError';
  }
}

/** A provider is not configured; callers should show "not connected", not fail loudly. */
export class NotConfiguredError extends Error {
  constructor(public provider: string, message?: string) {
    super(message ?? `${provider} is not configured`);
    this.name = 'NotConfiguredError';
  }
}
