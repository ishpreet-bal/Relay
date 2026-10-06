import { describe, it, expect } from 'vitest';
import { scoreAccount } from '../account-score';
import { scoreContact } from '../contact-score';
import { inferSeniority, locationMatches, titleMatches } from '../text';
import { EMPTY_ENGAGEMENT, type AccountFacts, type ContactFacts, type IcpCriteria } from '../types';

const NOW = new Date('2026-10-06T12:00:00Z');

// ABC Transport: regional trucking between Ontario and the US.
const abcIcp: IcpCriteria = {
  industries: ['Manufacturing', 'Distribution', 'Wholesale'],
  industryKeywords: ['ships', 'freight', 'distribution centre'],
  excludedIndustries: ['Trucking'],
  employeeMin: 20,
  employeeMax: 500,
  locations: ['Ontario'],
  targetTitles: ['Logistics Manager', 'Transportation Manager', 'Supply Chain Manager', 'Operations Director'],
  targetDepartments: ['Logistics', 'Supply Chain', 'Operations'],
  targetSeniorities: ['MANAGER', 'DIRECTOR', 'VP'],
  smallCompanyMaxEmployees: 50,
  smallCompanyTitles: ['Owner', 'President'],
  preferredSignals: ['EXPANSION', 'NEW_LOCATION', 'HIRING'],
};

const manufacturer: AccountFacts = {
  industry: 'Industrial Manufacturing',
  description: 'Makes steel racking and ships across North America.',
  keywords: [],
  employeeCount: 140,
  employeeRange: null,
  city: 'Mississauga',
  region: 'ON',
  country: 'CA',
  websiteUrl: 'https://example-racking.com',
  doNotContact: false,
};

const logisticsManager: ContactFacts = {
  title: 'Senior Logistics Manager',
  seniority: 'UNKNOWN',
  department: null,
  isDecisionMaker: false,
  email: 'jane@example-racking.com',
  emailVerification: 'VALID',
  phone: '+1 905 555 0100',
  directPhone: '+1 905 555 0101',
  mobilePhone: null,
  doNotEmail: false,
  doNotCall: false,
};

describe('text matching', () => {
  it('matches titles by meaning, not exact string', () => {
    expect(titleMatches('Sr. Logistics Mgr', 'Logistics Manager')).toBe(true);
    expect(titleMatches('VP, Operations', 'Vice President Operations')).toBe(true);
    expect(titleMatches('Logistics Coordinator', 'Logistics Manager')).toBe(false);
  });

  it('infers seniority only from clear words', () => {
    expect(inferSeniority('Vice President, Supply Chain')).toBe('VP');
    expect(inferSeniority('President & CEO')).toBe('OWNER');
    expect(inferSeniority('Director of Operations')).toBe('DIRECTOR');
    expect(inferSeniority('Buyer')).toBe('UNKNOWN');
  });

  it('matches province codes to names but not country to province', () => {
    expect(locationMatches({ region: 'ON', country: 'CA' }, ['Ontario'])).toBe('Ontario');
    expect(locationMatches({ region: 'QC', country: 'CA' }, ['Ontario'])).toBeNull();
    expect(locationMatches({ region: 'QC', country: 'CA' }, ['Canada'])).toBe('Canada');
  });
});

describe('account score', () => {
  it('rates a target manufacturer with a fresh expansion signal highly, and explains why', () => {
    const score = scoreAccount({
      account: manufacturer,
      icp: abcIcp,
      contacts: [logisticsManager],
      signals: [{
        type: 'EXPANSION', title: 'Opened a second warehouse in Milton', detectedAt: new Date('2026-09-27'),
        eventDate: new Date('2026-09-27'), confidence: 0.9, evidenceStatus: 'VERIFIED',
      }],
      engagement: EMPTY_ENGAGEMENT,
      now: NOW,
    });

    const byKey = Object.fromEntries(score.components.map((c) => [c.key, c]));
    expect(byKey.fit!.points).toBe(40);
    expect(byKey.contact!.points).toBe(20);
    expect(byKey.signals!.points).toBeGreaterThanOrEqual(10);
    expect(score.total).toBeGreaterThanOrEqual(75);
    expect(score.flags).toEqual([]);
    expect(score.summary).toMatch(/target industry|target title|warehouse/i);
    // Every component explains itself.
    for (const c of score.components) expect(c.reasons.length).toBeGreaterThan(0);
  });

  it('flags an excluded industry instead of quietly scoring it', () => {
    const score = scoreAccount({
      account: { ...manufacturer, industry: 'Trucking & Freight' },
      icp: abcIcp, contacts: [], signals: [], engagement: EMPTY_ENGAGEMENT, now: NOW,
    });
    expect(score.flags).toContain('Excluded industry');
  });

  it('decays stale signals and ignores rejected ones', () => {
    const base = { account: manufacturer, icp: abcIcp, contacts: [logisticsManager], engagement: EMPTY_ENGAGEMENT, now: NOW };
    const fresh = scoreAccount({ ...base, signals: [{ type: 'HIRING', title: 'Hiring', detectedAt: new Date('2026-10-01'), eventDate: null, confidence: 1, evidenceStatus: 'VERIFIED' }] });
    const stale = scoreAccount({ ...base, signals: [{ type: 'HIRING', title: 'Hiring', detectedAt: new Date('2025-10-01'), eventDate: null, confidence: 1, evidenceStatus: 'VERIFIED' }] });
    const rejected = scoreAccount({ ...base, signals: [{ type: 'HIRING', title: 'Hiring', detectedAt: new Date('2026-10-01'), eventDate: null, confidence: 1, evidenceStatus: 'REJECTED' }] });
    const s = (x: typeof fresh) => x.components.find((c) => c.key === 'signals')!.points;
    expect(s(fresh)).toBeGreaterThan(s(stale));
    expect(s(rejected)).toBe(0);
  });

  it('scores neutrally, and says so, when there is no ICP', () => {
    const score = scoreAccount({ account: manufacturer, icp: null, contacts: [], signals: [], engagement: EMPTY_ENGAGEMENT, now: NOW });
    const fit = score.components.find((c) => c.key === 'fit')!;
    expect(fit.reasons.some((r) => /no industry criteria/i.test(r.label))).toBe(true);
  });

  it('uses the same machinery for a different client and ICP', () => {
    // Industrial supplier selling precision bearings to equipment makers.
    const supplierIcp: IcpCriteria = {
      ...abcIcp,
      industries: ['Machinery', 'Equipment Manufacturing'],
      industryKeywords: ['conveyor', 'gearbox'],
      excludedIndustries: [],
      locations: ['Ontario', 'Michigan', 'Ohio'],
      targetTitles: ['Purchasing Manager', 'Engineering Manager'],
      targetDepartments: ['Supply Chain', 'Engineering'],
    };
    const score = scoreAccount({
      account: { ...manufacturer, industry: 'Equipment Manufacturing', region: 'MI', country: 'US' },
      icp: supplierIcp,
      contacts: [{ ...logisticsManager, title: 'Purchasing Manager' }],
      signals: [],
      engagement: EMPTY_ENGAGEMENT,
      now: NOW,
    });
    expect(score.components.find((c) => c.key === 'fit')!.points).toBe(40);
    expect(score.components.find((c) => c.key === 'contact')!.points).toBe(20);
  });
});

describe('contact score', () => {
  it('prefers the target role over a senior person in the wrong department', () => {
    const right = scoreContact({ contact: logisticsManager, icp: abcIcp, employeeCount: 140, engagement: EMPTY_ENGAGEMENT });
    const wrong = scoreContact({ contact: { ...logisticsManager, title: 'Director of Marketing' }, icp: abcIcp, employeeCount: 140, engagement: EMPTY_ENGAGEMENT });
    expect(right.total).toBeGreaterThan(wrong.total);
  });

  it('treats the owner of a small company as the buyer', () => {
    const owner = scoreContact({ contact: { ...logisticsManager, title: 'Owner' }, icp: abcIcp, employeeCount: 30, engagement: EMPTY_ENGAGEMENT });
    expect(owner.components.find((c) => c.key === 'role')!.points).toBeGreaterThanOrEqual(45);
  });

  it('zeroes a contact who may not be contacted at all', () => {
    const dnc = scoreContact({ contact: { ...logisticsManager, doNotEmail: true, doNotCall: true }, icp: abcIcp, employeeCount: 140, engagement: EMPTY_ENGAGEMENT });
    expect(dnc.total).toBe(0);
    expect(dnc.flags).toContain('Do not contact');
  });
});
