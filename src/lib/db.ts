import { PrismaClient, type Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/**
 * Runs a transaction with the tenant id bound to the Postgres session, so RLS
 * policies apply even if a query forgets its organizationId filter. This is the
 * second of two locks on tenant isolation; the first is the typed repository
 * layer in src/server/services.
 */
export async function withTenant<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, organizationId);
    return fn(tx);
  });
}
