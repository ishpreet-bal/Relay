/**
 * The engineering lifecycle and its gates. A project leaves a stage only when
 * the evidence the gate asks for is recorded: an accepted document, a decided
 * approval, finished and independently checked tasks. An agent saying it is
 * done is not evidence. Gates are pure functions of a snapshot so they can be
 * tested without a database and shown to people exactly as evaluated.
 */

export const STAGES = [
  'INTAKE', 'REQUIREMENTS', 'ANALYSIS', 'DESIGN', 'ESTIMATE', 'SCOPE_APPROVAL', 'TASKS',
  'DEVELOPMENT', 'QA', 'SECURITY', 'ACCEPTANCE', 'DEPLOY_APPROVAL', 'DEPLOYMENT', 'MONITORING', 'MAINTENANCE',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  INTAKE: 'Intake', REQUIREMENTS: 'Requirements', ANALYSIS: 'Business analysis', DESIGN: 'Solution design',
  ESTIMATE: 'Scope and cost', SCOPE_APPROVAL: 'Scope approval', TASKS: 'Task plan', DEVELOPMENT: 'Development',
  QA: 'Independent QA', SECURITY: 'Security review', ACCEPTANCE: 'Acceptance testing', DEPLOY_APPROVAL: 'Deployment approval',
  DEPLOYMENT: 'Deployment', MONITORING: 'Monitoring', MAINTENANCE: 'Maintenance',
};

export const ARTIFACT_KINDS = ['REQUIREMENTS', 'ANALYSIS', 'ARCHITECTURE', 'ESTIMATE', 'TEST_REPORT', 'SECURITY_REPORT', 'DEPLOYMENT', 'HANDOVER'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface GateSnapshot {
  problem: string;
  artifacts: Array<{ id: string; kind: string; version: number; status: string; data: unknown; createdBy: string }>;
  approvals: Array<{ id: string; kind: string; status: string }>;
  tasks: Array<{ id: string; role: string; status: string; acceptanceCriteria: string[]; evidence: unknown; verifiedBy: string | null }>;
}

export interface GateResult {
  met: boolean;
  /** Each requirement, in plain words, and whether it holds. */
  checks: Array<{ label: string; ok: boolean }>;
  /** Ids that satisfied the gate, stored with the stage run. */
  evidence: Record<string, unknown>;
}

const latest = (s: GateSnapshot, kind: ArtifactKind) =>
  s.artifacts.filter((a) => a.kind === kind).sort((a, b) => b.version - a.version)[0] ?? null;

const accepted = (s: GateSnapshot, kind: ArtifactKind, label: string) => {
  const a = latest(s, kind);
  return { check: { label, ok: a?.status === 'ACCEPTED' }, id: a?.status === 'ACCEPTED' ? a.id : null };
};

const approved = (s: GateSnapshot, kind: string, label: string) => {
  const a = s.approvals.find((x) => x.kind === kind && x.status === 'APPROVED');
  return { check: { label, ok: !!a }, id: a?.id ?? null };
};

const field = (data: unknown, key: string): unknown => (data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined);

function result(checks: GateResult['checks'], evidence: Record<string, unknown>): GateResult {
  return { met: checks.length > 0 && checks.every((c) => c.ok), checks, evidence };
}

/** What it takes to leave `stage`. MONITORING and MAINTENANCE are ongoing and never "complete". */
export function evaluateGate(stage: Stage, s: GateSnapshot): GateResult {
  const live = s.tasks.filter((t) => t.status !== 'CANCELLED');
  switch (stage) {
    case 'INTAKE':
      return result([{ label: 'The business problem is written down', ok: s.problem.trim().length >= 20 }], {});
    case 'REQUIREMENTS': {
      const r = accepted(s, 'REQUIREMENTS', 'Requirements document accepted by a person');
      return result([r.check], { requirements: r.id });
    }
    case 'ANALYSIS': {
      const r = accepted(s, 'ANALYSIS', 'Process analysis accepted by a person');
      return result([r.check], { analysis: r.id });
    }
    case 'DESIGN': {
      const r = accepted(s, 'ARCHITECTURE', 'Architecture accepted by a person');
      return result([r.check], { architecture: r.id });
    }
    case 'ESTIMATE': {
      const r = accepted(s, 'ESTIMATE', 'Estimate of time and running cost accepted by a person');
      return result([r.check], { estimate: r.id });
    }
    case 'SCOPE_APPROVAL': {
      const r = approved(s, 'SCOPE', 'Scope and price approved');
      return result([r.check], { approval: r.id });
    }
    case 'TASKS':
      return result([
        { label: 'At least one engineering task is planned', ok: live.length > 0 },
        { label: 'Every task has acceptance criteria', ok: live.length > 0 && live.every((t) => t.acceptanceCriteria.length > 0) },
      ], { tasks: live.map((t) => t.id) });
    case 'DEVELOPMENT': {
      const done = live.filter((t) => t.status === 'DONE');
      return result([
        { label: 'Every task is done', ok: live.length > 0 && done.length === live.length },
        { label: 'Every done task has evidence (pull request, commit or test run)', ok: done.every((t) => hasEvidence(t.evidence)) },
        { label: 'Every done task was checked by someone other than its author', ok: done.every((t) => !!t.verifiedBy && t.verifiedBy !== `role:${t.role}`) },
      ], { tasks: done.map((t) => t.id) });
    }
    case 'QA': {
      const r = latest(s, 'TEST_REPORT');
      const independent = !!r && !r.createdBy.startsWith('agent:developer');
      return result([
        { label: 'Test report accepted by a person', ok: r?.status === 'ACCEPTED' },
        { label: 'Every test passed', ok: field(r?.data, 'passed') === true },
        { label: 'Tests were run by QA, not by the developer', ok: independent },
      ], { testReport: r?.id ?? null });
    }
    case 'SECURITY': {
      const r = latest(s, 'SECURITY_REPORT');
      return result([
        { label: 'Security report accepted by a person', ok: r?.status === 'ACCEPTED' },
        { label: 'No open high or critical findings', ok: field(r?.data, 'openHighOrCritical') === 0 },
      ], { securityReport: r?.id ?? null });
    }
    case 'ACCEPTANCE': {
      const r = approved(s, 'ACCEPTANCE', 'The customer accepted the delivered work');
      return result([r.check], { approval: r.id });
    }
    case 'DEPLOY_APPROVAL': {
      const r = approved(s, 'PRODUCTION_DEPLOY', 'Production deployment approved');
      return result([r.check], { approval: r.id });
    }
    case 'DEPLOYMENT': {
      const d = accepted(s, 'DEPLOYMENT', 'Deployment record accepted (what was deployed, where, how to roll back)');
      const h = accepted(s, 'HANDOVER', 'Handover documentation accepted');
      return result([d.check, h.check], { deployment: d.id, handover: h.id });
    }
    case 'MONITORING':
    case 'MAINTENANCE':
      return result([], {});
  }
}

function hasEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== 'object') return false;
  return Object.values(evidence as Record<string, unknown>).some((v) => typeof v === 'string' ? v.trim().length > 0 : !!v);
}

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1]! : null;
}

export function isStage(v: string): v is Stage {
  return (STAGES as readonly string[]).includes(v);
}
