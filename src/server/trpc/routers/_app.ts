import { router } from '../init';
import { leadsRouter } from './leads';
import { researchRouter } from './research';
import { messagesRouter } from './messages';
import { suppressionRouter } from './suppression';
import { analyticsRouter } from './analytics';
import { campaignsRouter } from './campaigns';
import { templatesRouter } from './templates';
import { proposalsRouter } from './proposals';
import { adminRouter } from './admin';

export const appRouter = router({
  leads: leadsRouter,
  research: researchRouter,
  messages: messagesRouter,
  suppression: suppressionRouter,
  analytics: analyticsRouter,
  campaigns: campaignsRouter,
  templates: templatesRouter,
  proposals: proposalsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
