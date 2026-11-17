import type { Permission } from '@/lib/rbac';
import { MODELS } from '@/server/ai/pricing';

/**
 * The engineering agents. Each is a role with a defined job, output, tools
 * and limits, not a persona. Which model a role uses is one table
 * (ai/pricing MODELS), so Relay never depends on a particular model.
 *
 * `runtime` says how the role executes:
 *  - structured: one model call through ai/provider (budgeted, logged) that
 *    returns a document; no code access.
 *  - sandbox: an agent loop in an isolated per-task sandbox with a checkout
 *    of the project's repository, never Relay's own secrets. Not built yet.
 *  - code: ordinary Relay code (the orchestrator).
 */

export interface AgentDefinition {
  role: string;
  name: string;
  job: string;
  runtime: 'structured' | 'sandbox' | 'code';
  model: string | null;
  /** What it produces. */
  output: string;
  /** What it may use. */
  tools: string[];
  /** Consequential actions it can only prepare, as approval requests. */
  preparesOnly: string[];
  /** The permission a person needs to start or retry its work. */
  permission: Permission;
  /** Built and usable today. */
  available: boolean;
}

export const AGENTS: AgentDefinition[] = [
  { role: 'orchestrator', name: 'Engineering orchestrator', runtime: 'code', model: null, available: true, permission: 'studio:write',
    job: 'Moves projects through their stages when the evidence is there, schedules tasks whose dependencies are done, enforces budgets, and escalates failures.',
    output: 'Stage changes with evidence, task schedule, alerts', tools: ['project state', 'task queue'], preparesOnly: [] },
  { role: 'analyst', name: 'Business analyst', runtime: 'structured', model: MODELS.analyst, available: false, permission: 'studio:write',
    job: 'Turns the customer\'s description into requirements: what they asked for versus what they need, edge cases, acceptance criteria and open questions.',
    output: 'Requirements and process analysis documents', tools: ['project brief', 'account research', 'uploaded documents'], preparesOnly: [] },
  { role: 'architect', name: 'Solution architect', runtime: 'structured', model: MODELS.architect, available: false, permission: 'studio:write',
    job: 'Designs the solution on Relay\'s existing modules and templates first, and custom code only where they fall short: integrations, data, security, hosting.',
    output: 'Architecture document', tools: ['requirements', 'Studio module and template catalogue'], preparesOnly: [] },
  { role: 'estimator', name: 'Estimator', runtime: 'code', model: null, available: false, permission: 'studio:write',
    job: 'Estimates hours from finished projects on the same template, and model and hosting cost per month.',
    output: 'Estimate document', tools: ['delivery calibration', 'cost model'], preparesOnly: [] },
  { role: 'developer', name: 'Developer', runtime: 'sandbox', model: MODELS.developer, available: false, permission: 'studio:write',
    job: 'Implements one task on its own branch, with tests, and opens a pull request. Frontend, backend, integration, database and workflow work.',
    output: 'Branch, commits and a pull request', tools: ['repository checkout', 'shell', 'test runner'], preparesOnly: ['merging to main'] },
  { role: 'qa', name: 'QA', runtime: 'sandbox', model: MODELS.reviewer, available: false, permission: 'studio:write',
    job: 'Checks a developer\'s work independently: runs the tests, tests the workflows and error handling, and reports defects. Never takes the developer\'s word for it.',
    output: 'Test report and defects', tools: ['repository checkout', 'test runner', 'browser'], preparesOnly: [] },
  { role: 'security', name: 'Security reviewer', runtime: 'sandbox', model: MODELS.reviewer, available: false, permission: 'studio:write',
    job: 'Reviews authentication, authorization, tenant isolation, input validation, secrets, dependencies and webhooks. Findings are fixed or escalated.',
    output: 'Security report', tools: ['repository checkout', 'dependency audit'], preparesOnly: [] },
  { role: 'devops', name: 'DevOps', runtime: 'sandbox', model: MODELS.developer, available: false, permission: 'studio:deploy',
    job: 'Prepares builds, environment configuration, logging and a rollback plan. Deploys only after approval.',
    output: 'Deployment plan and record', tools: ['build pipeline'], preparesOnly: ['production deployment', 'DNS change', 'infrastructure purchase'] },
  { role: 'maintenance', name: 'Maintenance', runtime: 'structured', model: MODELS.reviewer, available: false, permission: 'studio:write',
    job: 'Watches live applications for failures, expiring credentials and unusual cost, and proposes fixes as new tasks. Never changes production on its own.',
    output: 'Alerts and proposed tasks', tools: ['execution history', 'alerts', 'usage records'], preparesOnly: ['maintenance release'] },
];

export const AGENT_ROLES = AGENTS.map((a) => a.role);

export function agentByRole(role: string) {
  return AGENTS.find((a) => a.role === role) ?? null;
}
