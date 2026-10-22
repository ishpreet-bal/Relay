import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { canonicalDomain, normalizeCompanyName, socialNetworkOf } from './normalize';

/**
 * Brings accounts created before company keys existed up to date: fills
 * normalizedName, and takes shared-platform hosts (a Facebook page, a
 * Linktree) out of `domain`, where they would make unrelated businesses look
 * like the same company, keeping them as social profiles instead.
 *
 * Idempotent and batched; safe to run on every scheduler tick.
 */
export async function backfillCompanyKeys(limit = 500) {
  const rows = await db.account.findMany({
    where: { normalizedName: null },
    select: { id: true, name: true, domain: true, websiteUrl: true, socialProfiles: true },
    take: limit,
  });
  let fixedDomains = 0;
  for (const row of rows) {
    const data: Prisma.AccountUncheckedUpdateInput = { normalizedName: normalizeCompanyName(row.name) };
    if (row.domain) {
      const canonical = canonicalDomain(row.domain);
      if (canonical !== row.domain) {
        data.domain = canonical;
        fixedDomains++;
        const network = socialNetworkOf(row.websiteUrl ?? row.domain);
        if (network && row.websiteUrl) {
          data.socialProfiles = { ...((row.socialProfiles as object | null) ?? {}), [network]: row.websiteUrl };
        }
      }
    }
    try {
      await db.account.update({ where: { id: row.id }, data });
    } catch (err) {
      // A canonical domain another account already holds: keep the old value
      // here and let duplicate review sort it out.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        await db.account.update({ where: { id: row.id }, data: { normalizedName: data.normalizedName } });
      } else {
        throw err;
      }
    }
  }
  if (rows.length) logger.info('companies.backfilled', { accounts: rows.length, fixedDomains });
  return { accounts: rows.length, fixedDomains };
}
