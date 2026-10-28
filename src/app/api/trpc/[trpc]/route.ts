import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/trpc/routers/_app';
import { createContext } from '@/server/trpc/init';
import { logger } from '@/lib/logger';

// Some procedures do bounded long work (a discovery step runs for up to ~45s).
export const maxDuration = 60;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ headers: req.headers }),
    onError({ error, path }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        logger.error('trpc.request_failed', { path, error: error.cause ?? error });
      }
    },
  });

export { handler as GET, handler as POST };
