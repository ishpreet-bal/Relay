import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The job a piece of code is running inside, if any. Set by the job runner;
 * read by usage recording so every external cost is attributed to the job
 * that incurred it without threading an id through every call.
 */
export interface JobContext {
  jobId: string;
  queue: string;
  workerId: string;
}

const storage = new AsyncLocalStorage<JobContext>();

export function runInJob<T>(ctx: JobContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentJob(): JobContext | undefined {
  return storage.getStore();
}
