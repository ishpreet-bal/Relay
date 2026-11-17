import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { getSession, type Session } from '@/lib/auth';
import { can, ForbiddenError, type Permission } from '@/lib/rbac';
import { db } from '@/lib/db';
import { accessCan, accessFrom, type AccessContext } from '@/server/access/scope';
import { DomainError, NotConfiguredError, NotFoundError } from '@/server/errors';
import { BudgetExceededError } from '@/server/ai/budget';
import { logger } from '@/lib/logger';

export async function createContext(opts: { headers: Headers }) {
  return { session: await getSession(), headers: opts.headers, db };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Field-level errors so forms can highlight the offending input rather
        // than dumping a stringified Zod error into a toast.
        fieldErrors: error.cause instanceof ZodError ? error.cause.flatten().fieldErrors : null,
      },
    };
  },
});

export const router = t.router;

/**
 * Domain errors are mapped to transport codes here, once. Services throw
 * NotFoundError / DomainError / ForbiddenError and never import tRPC.
 */
const mapErrors = t.middleware(async ({ next, path }) => {
  const result = await next();
  if (result.ok) return result;

  const cause = result.error.cause;
  if (cause instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: cause.message, cause });
  }
  if (cause instanceof ForbiddenError) {
    throw new TRPCError({ code: 'FORBIDDEN', message: cause.message, cause });
  }
  if (cause instanceof DomainError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: cause.message, cause });
  }
  if (cause instanceof NotConfiguredError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: cause.message, cause });
  }
  if (cause instanceof BudgetExceededError) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: cause.message, cause });
  }
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    throw new TRPCError({ code: 'CONFLICT', message: 'That already exists.', cause });
  }
  if (result.error.code === 'INTERNAL_SERVER_ERROR') {
    logger.error('trpc.unhandled', { path, error: cause ?? result.error });
  }
  return result;
});

export const publicProcedure = t.procedure.use(mapErrors);

const enforceSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in and select your workspace to continue.' });
  const session = ctx.session as Session;
  return next({ ctx: { ...ctx, session, access: accessFrom(session) as AccessContext } });
});

export const protectedProcedure = publicProcedure.use(enforceSession);

/**
 * Permission-scoped procedure. Authorization is declared at the procedure
 * definition, so an endpoint cannot be added without stating what it requires.
 * Row-level scoping comes from ctx.access, which every service takes.
 */
export function permissionProcedure(permission: Permission) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!accessCan(ctx.access, permission)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: can(ctx.session.role, permission) ? `Limited to some clients: ${permission} is for staff who work across the workspace` : `Requires ${permission}` });
    }
    return next({ ctx });
  });
}
