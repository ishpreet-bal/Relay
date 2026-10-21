import { defineWorkspace } from 'vitest/config';

// Database tests share real queues (a drain claims whatever is due), so they
// run one file at a time; unit tests run in parallel.
export default defineWorkspace([
  { extends: './vitest.config.ts', test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.int.test.ts'] } },
  { extends: './vitest.config.ts', test: { name: 'db', include: ['src/**/*.int.test.ts'], pool: 'forks', poolOptions: { forks: { singleFork: true } } } },
]);
