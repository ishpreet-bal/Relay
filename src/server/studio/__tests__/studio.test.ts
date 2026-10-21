import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { cronMatches, lastFireBetween, parseCron } from '../cron';
import { render, resolve, validateRecord } from '../executor';
import { applyOverrides, breakingChanges, manifestSchema, overridesSchema, validateManifest, type Manifest } from '../manifest';
import { BUILTIN_TEMPLATES } from '../templates';

const claims = BUILTIN_TEMPLATES.find((t) => t.slug === 'manufacturing-quality-claims')!;
const base = manifestSchema.parse(claims.manifest);
const ctx = { clientId: 'c1', bindings: {}, connections: [] };

describe('built-in templates', () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.slug, t] as const))('%s is a valid manifest', (_, t) => {
    const r = validateManifest(t.manifest, ctx);
    expect(r.issues).toEqual([]);
    // Every workflow ships synthetic test input, so it can pass the deploy gate.
    expect(r.manifest!.workflows.every((w) => w.testInput)).toBe(true);
  });
});

describe('manifest validation', () => {
  const withWorkflowStep = (step: object) => ({
    ...base, workflows: [{ key: 'w', name: 'W', trigger: { type: 'manual' }, steps: [step] }],
  });

  it('rejects code, unknown modules and unknown step types', () => {
    expect(validateManifest({ ...base, script: 'process.exit(1)' }, ctx).ok).toBe(false);
    expect(validateManifest({ ...base, modules: [...base.modules, { key: 'eval', version: '1.0', config: {} }] }, ctx).issues[0]!.message).toMatch(/Unknown module/);
    expect(validateManifest(withWorkflowStep({ key: 's', type: 'run_javascript', config: { code: '1' } }), ctx).issues[0]!.message).toMatch(/Unknown step type/);
  });

  it('checks references to collections, fields, rules, roles and earlier steps', () => {
    const msg = (step: object) => validateManifest(withWorkflowStep(step), ctx).issues.map((i) => i.message).join(' | ');
    expect(msg({ key: 's', type: 'create_record', config: { collection: 'nope', data: {} } })).toMatch(/Unknown collection "nope"/);
    expect(msg({ key: 's', type: 'create_record', config: { collection: 'claims', data: { colour: 'red' } } })).toMatch(/Unknown field "colour"/);
    expect(msg({ key: 's', type: 'condition', config: { left: { $rule: 'missing' }, op: 'eq', right: 1 } })).toMatch(/Unknown rule "missing"/);
    expect(msg({ key: 's', type: 'notify', config: { toRoles: ['ceo'], title: 'x' } })).toMatch(/Unknown role "ceo"/);
    expect(msg({ key: 's', type: 'condition', config: { left: { $step: 'later.value' }, op: 'eq', right: 1 } })).toMatch(/hasn't run yet/);
  });

  it('needs the module that provides a step, and a valid schedule and time zone', () => {
    const noApprovals = { ...base, modules: base.modules.filter((m) => m.key !== 'approvals') };
    expect(validateManifest(noApprovals, ctx).issues.map((i) => i.message).join()).toMatch(/needs the Approvals module/);
    const sched = (trigger: object) => validateManifest({ ...base, workflows: [{ ...base.workflows[1]!, trigger }] }, ctx).issues.map((i) => i.message).join();
    expect(sched({ type: 'schedule', cron: '61 * * * *' })).toMatch(/valid five-field cron/);
    expect(sched({ type: 'schedule', cron: '0 7 * * 1', timezone: 'Mars/Olympus' })).toMatch(/Unknown time zone/);
    expect(sched({ type: 'schedule', cron: '0 7 * * 1', timezone: 'America/Toronto' })).toBe('');
  });

  it("only accepts this customer's own connections for an integration", () => {
    const m = { ...base, modules: [...base.modules, { key: 'integrations', version: '1.0', config: {} }], integrations: [{ key: 'erp', provider: 'rest_api', required: true, purpose: 'x' }] };
    const conn = { id: '00000000-0000-4000-8000-000000000001', provider: 'rest_api', status: 'CONNECTED' };
    expect(validateManifest(m, { clientId: 'c1', bindings: {}, connections: [] }).issues[0]!.message).toMatch(/has no connection/);
    expect(validateManifest(m, { clientId: 'c1', bindings: { erp: conn.id }, connections: [{ ...conn, clientId: 'c2' }] }).issues[0]!.message).toMatch(/not one of this customer's/);
    expect(validateManifest(m, { clientId: 'c1', bindings: { erp: conn.id }, connections: [{ ...conn, clientId: 'c1' }] }).ok).toBe(true);
  });
});

describe('overrides', () => {
  it('change only what the customer set, and refuse anything outside the override surface', () => {
    const o = overridesSchema.parse({ branding: { displayName: 'Acme QA' }, rules: { escalation_quantity: 5 }, disabledWorkflows: ['weekly_report'], extraFields: { claims: [{ key: 'lot', label: 'Lot', type: 'text' }] } });
    const m = applyOverrides(base, o);
    expect(m.branding).toMatchObject({ displayName: 'Acme QA', primaryColor: base.branding.primaryColor });
    expect(m.rules.escalation_quantity).toBe(5);
    expect(m.workflows.map((w) => w.key)).toEqual(['claim_intake']);
    expect(m.collections[0]!.fields.at(-1)!.key).toBe('lot');
    expect(base.collections[0]!.fields.some((f) => f.key === 'lot')).toBe(false); // the template is untouched
    expect(overridesSchema.safeParse({ workflows: [] }).success).toBe(false);
    expect(overridesSchema.safeParse({ limits: { maxExecutionsPerDay: 1_000_000 } }).success).toBe(false);
  });

  it('flags breaking template changes', () => {
    const next: Manifest = { ...base, rules: {}, collections: [{ ...base.collections[0]!, fields: base.collections[0]!.fields.filter((f) => f.key !== 'defect') }] };
    expect(breakingChanges(base, next)).toEqual(['Field "claims.defect" removed', 'Rule "escalation_quantity" removed']);
    expect(breakingChanges(base, base)).toEqual([]);
  });
});

describe('executor values', () => {
  const run = { input: { customer: 'Synthetic Co', qty: 3, nested: { a: 1 } }, outputs: { count: { value: 7 } }, manifest: base };

  it('resolves references and renders text without evaluating anything', () => {
    expect(resolve({ $input: 'nested.a' }, run)).toBe(1);
    expect(resolve({ $input: '*' }, run)).toEqual(run.input);
    expect(resolve({ $step: 'count.value' }, run)).toBe(7);
    expect(resolve({ $rule: 'escalation_quantity' }, run)).toBe(50);
    expect(resolve({ a: [{ $input: 'qty' }, 'x'] }, run)).toEqual({ a: [3, 'x'] });
    expect(render('{{input.customer}}: {{steps.count.value}} of {{rules.escalation_quantity}}', run)).toBe('Synthetic Co: 7 of 50');
    expect(render('{{input.constructor.constructor}} {{ process.env }}', run)).toBe(' {{ process.env }}');
  });

  it("validates and cleans records by the collection's field rules", () => {
    const ok = validateRecord(base, 'claims', { customer: 'A', part_number: 'P', defect: 'D', quantity: '12', severity: 'high', extra: 'dropped' });
    expect(ok).toMatchObject({ valid: true, clean: { quantity: 12, severity: 'high' } });
    expect(ok.clean).not.toHaveProperty('extra');
    const bad = validateRecord(base, 'claims', { customer: 'A', quantity: 'many', severity: 'urgent' });
    expect(bad.valid).toBe(false);
    expect(bad.errors).toEqual(expect.arrayContaining(['Part number is required', 'Quantity affected must be a number', 'Severity must be one of low, medium, high']));
  });
});

describe('cron', () => {
  it('parses and matches in UTC and in a time zone', () => {
    expect(parseCron('*/15 9-17 * * 1-5')).not.toBeNull();
    expect(parseCron('0 7 * *')).toBeNull();
    expect(parseCron('0 24 * * *')).toBeNull();
    const spec = parseCron('0 7 * * 1')!;
    // Monday 2026-10-19 07:00 in Toronto is 11:00 UTC (EDT).
    expect(cronMatches(spec, new Date('2026-10-19T11:00:00Z'), 'America/Toronto')).toBe(true);
    expect(cronMatches(spec, new Date('2026-10-19T07:00:00Z'), 'America/Toronto')).toBe(false);
    expect(cronMatches(spec, new Date('2026-10-19T07:00:00Z'))).toBe(true);
  });

  it('finds the last slot in a window, and none when the window has no slot', () => {
    const at = lastFireBetween('0 7 * * 1', new Date('2026-10-19T00:00:00Z'), new Date('2026-10-20T00:00:00Z'), 'America/Toronto');
    expect(at?.toISOString()).toBe('2026-10-19T11:00:00.000Z');
    expect(lastFireBetween('0 7 * * 1', new Date('2026-10-19T11:00:00Z'), new Date('2026-10-20T00:00:00Z'), 'America/Toronto')).toBeNull();
  });
});

describe('secrets at rest', () => {
  it('round-trips, uses a fresh IV each time, and rejects tampering', () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const a = encryptSecret('Bearer sk_test_123');
    expect(a).not.toContain('sk_test_123');
    expect(encryptSecret('Bearer sk_test_123')).not.toBe(a);
    expect(decryptSecret(a)).toBe('Bearer sk_test_123');
    const parts = a.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
});
