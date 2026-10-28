import { describe, it, expect } from 'vitest';
import { verifyClaims, checkSupport, specificTerms } from '../claims';
import { decideApproval } from '../policy';
import type { LedgerFact } from '../types';

const NOW = new Date('2026-10-06T12:00:00Z');

const torontoFacility: LedgerFact = {
  id: 'f1',
  kind: 'prospect',
  claimType: 'EXPANSION',
  statement: 'Acme announced the opening of its Toronto manufacturing facility in September 2026.',
  sourceUrl: 'https://acme.example/news/toronto',
  sourceQuote: 'Acme is proud to announce the opening of our new Toronto manufacturing facility.',
  evidenceStatus: 'VERIFIED',
  eventDate: new Date('2026-09-14'),
  detectedAt: new Date('2026-10-01'),
  firmographic: false,
};

const hiring: LedgerFact = {
  id: 'f2',
  kind: 'prospect',
  claimType: 'HIRING',
  statement: 'Acme is hiring three logistics coordinators.',
  sourceUrl: 'https://acme.example/careers',
  sourceQuote: 'We are hiring 3 Logistics Coordinators for our Mississauga warehouse.',
  evidenceStatus: 'VERIFIED',
  eventDate: null,
  detectedAt: new Date('2026-10-04'),
  firmographic: false,
};

const proof: LedgerFact = {
  id: 's1',
  kind: 'sender',
  claimType: null,
  statement: 'We work with manufacturers that regularly ship between Ontario and Michigan.',
  sourceUrl: null,
  sourceQuote: null,
  evidenceStatus: 'VERIFIED',
  eventDate: null,
  detectedAt: null,
  firmographic: false,
  proofPointId: 'pp1',
};

const ENTITIES = ['Jane', 'Acme', 'ABC Transport', 'Sam'];
const ALL_TYPES = ['EXPANSION', 'HIRING'] as const;

function verify(body: string, reported: Array<{ sentence: string; factId: string | null; kind: 'PROSPECT' | 'SENDER' }>, approved: readonly ('EXPANSION' | 'HIRING')[] = ALL_TYPES) {
  return verifyClaims({
    subject: 'Ontario freight capacity',
    body,
    reported,
    ledger: [torontoFacility, hiring, proof],
    approvedClaimTypes: approved,
    knownEntities: ENTITIES,
    now: NOW,
  });
}

describe('claim verification', () => {
  it('accepts a claim that restates the source', () => {
    const sentence = 'I saw that Acme recently opened a manufacturing facility in Toronto.';
    const r = verify(`Hi Jane,\n\n${sentence}\n\nSam`, [{ sentence, factId: 'f1', kind: 'PROSPECT' }]);
    expect(r.claims[0]!.status).toBe('SUPPORTED');
    expect(r.status).toBe('VERIFIED');
    expect(r.score).toBeGreaterThanOrEqual(0.92);
  });

  it('rejects a claim that goes beyond the source', () => {
    const sentence = 'I saw that Acme is rapidly expanding across Canada.';
    const r = verify(`Hi Jane,\n\n${sentence}\n\nSam`, [{ sentence, factId: 'f1', kind: 'PROSPECT' }]);
    expect(r.claims[0]!.status).toBe('UNSUPPORTED');
    expect(r.claims[0]!.reason).toMatch(/canada|rapidly|across/i);
    expect(r.status).toBe('UNSUPPORTED');
  });

  it('flags a number that disagrees with the source as a contradiction', () => {
    const sentence = "You're hiring five logistics coordinators.";
    const r = verify(sentence, [{ sentence, factId: 'f2', kind: 'PROSPECT' }]);
    expect(r.claims[0]!.status).toBe('CONTRADICTED');
    expect(r.status).toBe('BLOCKED');
  });

  it('accepts a number written differently from the source', () => {
    const sentence = "You're hiring three logistics coordinators.";
    const r = verify(sentence, [{ sentence, factId: 'f2', kind: 'PROSPECT' }]);
    expect(r.claims[0]!.status).toBe('SUPPORTED');
  });

  it('will not call undated evidence "recent"', () => {
    const sentence = "Saw you're recently hiring three logistics coordinators.";
    const r = verify(sentence, [{ sentence, factId: 'f2', kind: 'PROSPECT' }]);
    expect(r.claims[0]!.status).toBe('STALE');
    expect(r.status).toBe('REVIEW_REQUIRED');
  });

  it('marks old time-sensitive evidence stale', () => {
    const old = { ...torontoFacility, eventDate: new Date('2025-01-10') };
    const sentence = 'Acme opened a manufacturing facility in Toronto.';
    const r = verifyClaims({
      subject: '', body: sentence, reported: [{ sentence, factId: 'f1', kind: 'PROSPECT' }],
      ledger: [old], approvedClaimTypes: ALL_TYPES, knownEntities: ENTITIES, now: NOW,
    });
    expect(r.claims[0]!.status).toBe('STALE');
  });

  it('lets general sales copy through without evidence', () => {
    const r = verify('We move freight between Ontario and the US every day.\n\nWorth a quick call?', []);
    expect(r.claims).toHaveLength(0);
    expect(r.status).toBe('VERIFIED');
  });

  it('supports sender claims from an approved proof point', () => {
    const sentence = 'We work with manufacturers that regularly ship between Ontario and Michigan.';
    const r = verify(sentence, [{ sentence, factId: 's1', kind: 'SENDER' }]);
    expect(r.claims[0]!.kind).toBe('SENDER_PROOF');
    expect(r.claims[0]!.status).toBe('SUPPORTED');
  });

  it('catches knowledge the model asserted but did not report', () => {
    const r = verify('Congrats on the new Detroit warehouse.\n\nWe move freight daily.', []);
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]!.status).toBe('UNSUPPORTED');
    expect(r.status).toBe('UNSUPPORTED');
  });

  it('treats a cited fact that does not exist as unsupported', () => {
    const sentence = 'I saw Acme won a contract with Ford.';
    const r = verify(sentence, [{ sentence, factId: 'f99', kind: 'PROSPECT' }]);
    expect(r.claims[0]!.status).toBe('UNSUPPORTED');
  });

  it('requires review when a supported claim is of an unapproved type', () => {
    const sentence = 'I saw that Acme recently opened a manufacturing facility in Toronto.';
    const r = verify(sentence, [{ sentence, factId: 'f1', kind: 'PROSPECT' }], ['HIRING']);
    expect(r.claims[0]!.status).toBe('SUPPORTED');
    expect(r.status).toBe('REVIEW_REQUIRED');
  });

  it('weighs unverified evidence lower', () => {
    const manual = { ...torontoFacility, evidenceStatus: 'UNVERIFIED' as const };
    const support = checkSupport('Acme opened a manufacturing facility in Toronto.', manual, ENTITIES);
    expect(support.score).toBeLessThan(0.85);
  });

  it('does not count sentence-initial capitals or known names as specifics', () => {
    expect(specificTerms('Jane, Acme ships a lot.', ENTITIES).properNouns).toEqual([]);
  });
});

describe('approval policy', () => {
  const verified = verify(
    'I saw that Acme recently opened a manufacturing facility in Toronto.',
    [{ sentence: 'I saw that Acme recently opened a manufacturing facility in Toronto.', factId: 'f1', kind: 'PROSPECT' }],
  );

  it('holds even a verified draft in a legacy auto campaign for human approval', () => {
    const d = decideApproval({
      mode: 'AUTO_APPROVE_VERIFIED', threshold: 0.92, approvedClaimTypes: ['EXPANSION'],
      verification: verified, hasLintBlockers: false, tier: 'VERIFIED', campaignActive: true,
    });
    expect(d.autoApprove).toBe(false);
    expect(d.reasons).toContain('A person must review every outreach message.');
    expect(d.snapshot.threshold).toBe(0.92);
  });

  it('never auto-approves in a review-everything campaign', () => {
    const d = decideApproval({
      mode: 'REVIEW_ALL', threshold: 0.5, approvedClaimTypes: ['EXPANSION'],
      verification: verified, hasLintBlockers: false, tier: 'VERIFIED', campaignActive: true,
    });
    expect(d.autoApprove).toBe(false);
  });

  it('explains every reason a draft was held', () => {
    const d = decideApproval({
      mode: 'AUTO_APPROVE_VERIFIED', threshold: 0.99, approvedClaimTypes: [],
      verification: { ...verified, status: 'PARTIALLY_VERIFIED', score: 0.8 },
      hasLintBlockers: true, tier: 'VERIFIED', campaignActive: true,
    });
    expect(d.autoApprove).toBe(false);
    expect(d.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
