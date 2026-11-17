import { describe, expect, it } from 'vitest';
import { evaluateGate, nextStage, STAGES, type GateSnapshot } from '../stages';

const empty: GateSnapshot = { problem: 'We re-key 300 supplier invoices a week into our accounting system by hand.', artifacts: [], approvals: [], tasks: [] };
const doc = (kind: string, status = 'ACCEPTED', data: unknown = null, createdBy = 'user:u1', version = 1) => ({ id: `${kind}-${version}`, kind, version, status, data, createdBy });
const task = (over: Partial<GateSnapshot['tasks'][number]> = {}) => ({ id: 't1', role: 'developer', status: 'DONE', acceptanceCriteria: ['Totals match the PDF'], evidence: { pullRequest: 'https://github.com/acme/x/pull/1' }, verifiedBy: 'user:u2', ...over });

describe('stage gates', () => {
  it('walks every stage in order and ends at maintenance', () => {
    expect(STAGES[0]).toBe('INTAKE');
    expect(nextStage('MAINTENANCE')).toBeNull();
    expect(nextStage('QA')).toBe('SECURITY');
  });

  it('needs a written problem to leave intake', () => {
    expect(evaluateGate('INTAKE', empty).met).toBe(true);
    expect(evaluateGate('INTAKE', { ...empty, problem: 'automate stuff' }).met).toBe(false);
  });

  it('needs documents accepted by a person, not drafts', () => {
    expect(evaluateGate('REQUIREMENTS', { ...empty, artifacts: [doc('REQUIREMENTS', 'DRAFT')] }).met).toBe(false);
    expect(evaluateGate('REQUIREMENTS', { ...empty, artifacts: [doc('REQUIREMENTS')] }).met).toBe(true);
    // The latest version decides: an accepted v1 does not cover an unreviewed v2.
    expect(evaluateGate('DESIGN', { ...empty, artifacts: [doc('ARCHITECTURE'), doc('ARCHITECTURE', 'DRAFT', null, 'user:u1', 2)] }).met).toBe(false);
  });

  it('needs an approved approval, not a pending or rejected one', () => {
    expect(evaluateGate('SCOPE_APPROVAL', { ...empty, approvals: [{ id: 'a', kind: 'SCOPE', status: 'PENDING' }] }).met).toBe(false);
    expect(evaluateGate('SCOPE_APPROVAL', { ...empty, approvals: [{ id: 'a', kind: 'SCOPE', status: 'REJECTED' }] }).met).toBe(false);
    expect(evaluateGate('DEPLOY_APPROVAL', { ...empty, approvals: [{ id: 'a', kind: 'SCOPE', status: 'APPROVED' }] }).met).toBe(false);
    expect(evaluateGate('DEPLOY_APPROVAL', { ...empty, approvals: [{ id: 'a', kind: 'PRODUCTION_DEPLOY', status: 'APPROVED' }] }).met).toBe(true);
  });

  it('plans tasks only with acceptance criteria', () => {
    expect(evaluateGate('TASKS', empty).met).toBe(false);
    expect(evaluateGate('TASKS', { ...empty, tasks: [task({ status: 'READY', acceptanceCriteria: [] })] }).met).toBe(false);
    expect(evaluateGate('TASKS', { ...empty, tasks: [task({ status: 'READY' })] }).met).toBe(true);
  });

  it('finishes development only with evidence and an independent check', () => {
    expect(evaluateGate('DEVELOPMENT', { ...empty, tasks: [task()] }).met).toBe(true);
    expect(evaluateGate('DEVELOPMENT', { ...empty, tasks: [task({ status: 'REVIEW' })] }).met).toBe(false);
    expect(evaluateGate('DEVELOPMENT', { ...empty, tasks: [task({ evidence: {} })] }).met).toBe(false);
    expect(evaluateGate('DEVELOPMENT', { ...empty, tasks: [task({ verifiedBy: null })] }).met).toBe(false);
    expect(evaluateGate('DEVELOPMENT', { ...empty, tasks: [task({ verifiedBy: 'role:developer' })] }).met).toBe(false);
    // Cancelled tasks don't hold the stage up.
    expect(evaluateGate('DEVELOPMENT', { ...empty, tasks: [task(), task({ id: 't2', status: 'CANCELLED', evidence: null, verifiedBy: null })] }).met).toBe(true);
  });

  it('passes QA only on an accepted, passing report that the developer did not write', () => {
    const report = (data: unknown, by = 'agent:qa:run1') => ({ ...empty, artifacts: [doc('TEST_REPORT', 'ACCEPTED', data, by)] });
    expect(evaluateGate('QA', report({ passed: true })).met).toBe(true);
    expect(evaluateGate('QA', report({ passed: false })).met).toBe(false);
    expect(evaluateGate('QA', report({ passed: true }, 'agent:developer:run2')).met).toBe(false);
  });

  it('clears security only with no open high or critical findings', () => {
    const report = (data: unknown) => ({ ...empty, artifacts: [doc('SECURITY_REPORT', 'ACCEPTED', data)] });
    expect(evaluateGate('SECURITY', report({ openHighOrCritical: 0 })).met).toBe(true);
    expect(evaluateGate('SECURITY', report({ openHighOrCritical: 2 })).met).toBe(false);
    expect(evaluateGate('SECURITY', report({})).met).toBe(false);
  });

  it('treats monitoring and maintenance as ongoing', () => {
    expect(evaluateGate('MONITORING', empty).met).toBe(false);
    expect(evaluateGate('MAINTENANCE', empty).met).toBe(false);
  });
});
