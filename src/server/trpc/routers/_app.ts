import { router } from '../init';
import { sessionRouter } from './session';
import { clientsRouter } from './clients';
import { playbooksRouter } from './playbooks';
import { accountsRouter } from './accounts';
import { contactsRouter } from './contacts';
import { discoveryRouter } from './discovery';
import { pipelineRouter } from './pipeline';
import { studioRouter } from './studio';
import { researchRouter } from './research';
import { messagesRouter } from './messages';
import { campaignsRouter } from './campaigns';
import { callsRouter } from './calls';
import { meetingsRouter } from './meetings';
import { suppressionRouter } from './suppression';
import { analyticsRouter } from './analytics';
import { portalRouter } from './portal';
import { opsRouter } from './ops';
import { teamRouter } from './team';
import { mailboxesRouter } from './mailboxes';
import { adminRouter } from './admin';
import { templatesRouter } from './templates';
import { proposalsRouter } from './proposals';

export const appRouter = router({
  session: sessionRouter,
  clients: clientsRouter,
  playbooks: playbooksRouter,
  accounts: accountsRouter,
  contacts: contactsRouter,
  discovery: discoveryRouter,
  pipeline: pipelineRouter,
  studio: studioRouter,
  research: researchRouter,
  messages: messagesRouter,
  campaigns: campaignsRouter,
  calls: callsRouter,
  meetings: meetingsRouter,
  suppression: suppressionRouter,
  analytics: analyticsRouter,
  portal: portalRouter,
  ops: opsRouter,
  team: teamRouter,
  mailboxes: mailboxesRouter,
  admin: adminRouter,
  // Legacy agency tooling
  templates: templatesRouter,
  proposals: proposalsRouter,
});

export type AppRouter = typeof appRouter;
