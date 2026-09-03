import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { getSession, type Session } from '@/lib/auth';
import { can, type Permission } from '@/lib/rbac';
import { db } from '@/lib/db';

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
export const publicProcedure = t.procedure;

const enforceSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session as Session } });
});

export const protectedProcedure = t.procedure.use(enforceSession);

/**
 * Permission-scoped procedure. Authorization is declared at the procedure
 * definition, so an endpoint cannot be added without stating what it requires.
 */
export function permissionProcedure(permission: Permission) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!can(ctx.session.role, permission)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Requires ${permission}` });
    }
    return next({ ctx });
  });
}
