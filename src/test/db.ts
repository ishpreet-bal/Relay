/**
 * Database tests create and delete their own organizations, but they must
 * never run against a shared or production database by accident. They run
 * only when DATABASE_URL points at this machine (as in CI's service
 * container), or when RELAY_DB_TESTS=1 says the target is disposable.
 */
export function dbTestsAllowed(): boolean {
  if (process.env.RELAY_DB_TESTS === '1') return true;
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}
