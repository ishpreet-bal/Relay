import { describe, expect, it } from 'vitest';
import { buildReport, sampleRecords, validate } from '../quality';
import { draftEstimate, parseInquiry, SAMPLE_INQUIRIES } from '../estimate';
import { DAY_END, DAY_START, SHIPMENTS, dispatchSummary, stateAt, updatesBetween } from '../shipments';
import { route, SAMPLE_ITEMS, reminderPlan, reminderText, TOMORROW } from '../clinic';
import { EXISTING, findSlots, confirmation } from '../booking';
import { approve, draftOrders, initialState, reorderPoint, simulateDay, SKUS } from '../inventory';
import { DEFAULT_PROFILE, rank, score, PROSPECTS } from '../prospects';
import { DEMOS } from '../catalog';
import { INDUSTRIES } from '../../content/industries';

/**
 * The demos are small working programs on fictional data. These check that
 * they compute what they claim to, so the website never shows a number the
 * logic did not produce.
 */

describe('quality report', () => {
  const records = validate(sampleRecords());

  it('sends a blank measurement back, converts inches and standardizes labels', () => {
    expect(records.find((r) => r.id === 'B-007')).toMatchObject({ usable: false });
    const inch = records.find((r) => r.id === 'C-003')!;
    expect(inch.measuredMm).toBeCloseTo(42, 0);
    expect(inch.notes[0]).toMatch(/inches/);
    expect(records.find((r) => r.id === 'C-011')!.defectClean).toBe('Porosity');
  });

  it('works out yield per line from the records and flags lines below target', () => {
    const report = buildReport(records, { toleranceMm: 0.05, targetYield: 0.95 });
    expect(report.excluded).toBe(1);
    expect(report.overall.inspected).toBe(35);
    for (const line of report.lines) expect(line.yield).toBeCloseTo(line.passed / line.inspected);
    expect(report.alerts.length).toBe(report.lines.filter((l) => l.yield < 0.95).length);
    // A tighter tolerance can only fail more parts.
    const tight = buildReport(records, { toleranceMm: 0.02, targetYield: 0.95 });
    expect(tight.overall.passed).toBeLessThanOrEqual(report.overall.passed);
  });
});

describe('construction estimate', () => {
  it('reads the details an estimator needs from the customer’s own words', () => {
    const p = parseInquiry(SAMPLE_INQUIRIES[0]!.text);
    expect(p).toMatchObject({ type: 'kitchen', areaSqFt: 180, material: 'quartz', timeline: 'March', location: 'Mississauga', structural: true });
    expect(parseInquiry(SAMPLE_INQUIRIES[1]!.text)).toMatchObject({ type: 'deck', areaSqFt: 320, material: 'composite', location: 'Oakville' });
    expect(parseInquiry(SAMPLE_INQUIRIES[2]!.text)).toMatchObject({ type: 'commercial', areaSqFt: 2400, location: 'Vaughan', timeline: 'September' });
    expect(parseInquiry('Need a 20 m2 bathroom redone').areaSqFt).toBe(215);
  });

  it('prices from the rate sheet with contingency and HST, and plans the next steps', () => {
    const e = draftEstimate(SAMPLE_INQUIRIES[0]!.text);
    expect(e.subtotal).toBe(e.items.reduce((s, l) => s + l.cents, 0));
    expect(e.contingency).toBe(Math.round(e.subtotal * 0.1));
    expect(e.tax).toBe(Math.round((e.subtotal + e.contingency) * 0.13));
    expect(e.range[0]).toBeLessThan(e.total);
    expect(e.range[1]).toBeGreaterThan(e.total);
    expect(e.questions).toEqual([]);
    expect(e.tasks.map((t) => t.title)).toContain('Check structure and permit requirements');
  });

  it('asks for what is missing instead of guessing', () => {
    const e = draftEstimate('Can you help with a renovation?');
    expect(e.items).toEqual([]);
    expect(e.total).toBe(0);
    expect(e.questions.length).toBeGreaterThanOrEqual(3);
  });
});

describe('shipment tracking', () => {
  it('moves a shipment through its statuses as events arrive', () => {
    const s = SHIPMENTS.find((x) => x.id === 'SH-1042')!;
    expect(stateAt(s, 7 * 60).status).toBe('Scheduled');
    expect(stateAt(s, 9 * 60).status).toBe('In transit');
    expect(stateAt(s, 10 * 60).status).toBe('At risk');
    expect(stateAt(s, 12 * 60).status).toBe('Delayed');
    expect(stateAt(s, 15 * 60).status).toBe('Delivered');
  });

  it('writes one customer update per status change and none for routine scans', () => {
    const all = updatesBetween(DAY_START - 1, DAY_END);
    const events = SHIPMENTS.reduce((n, s) => n + s.events.length, 0);
    expect(all.length).toBeLessThan(events);
    expect(all.filter((u) => u.shipment === 'SH-1042').map((u) => u.status)).toEqual(['In transit', 'At risk', 'Delayed', 'Delivered']);
    expect(all.some((u) => u.shipment === 'SH-1048' && u.at === 15 * 60 + 30)).toBe(false);
    const summary = dispatchSummary(DAY_END);
    expect(Object.values(summary.counts).reduce((a, b) => a + b, 0)).toBe(SHIPMENTS.length);
  });
});

describe('clinic administration', () => {
  it('routes each item to a queue and never automates a clinical question', () => {
    const routed = SAMPLE_ITEMS.map(route);
    expect(routed.map((r) => r.queue)).toEqual(['Scheduling', 'Scheduling', 'Records', 'Billing', 'Front desk', 'Clinical team']);
    expect(routed.find((r) => r.queue === 'Clinical team')!.automated).toBe(false);
  });

  it('keeps reminders free of clinical details', () => {
    expect(reminderPlan(['24h', '2h'])).toMatchObject({ perPatient: 2, total: TOMORROW.length * 2 });
    const text = reminderText(TOMORROW[0]!, '24h');
    expect(text).toMatch(/tomorrow at 9:00 am/);
    expect(text).not.toMatch(/Dr\.|reason|procedure/i);
  });
});

describe('salon booking', () => {
  it('offers only slots long enough for the service, with cleanup time, closest first', () => {
    const slots = findSlots('colour', 'any', 11 * 60);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.staff).toBe('Maya');
      expect(s.end - s.start).toBe(120);
      for (const b of EXISTING.filter((x) => x.staff === 'Maya')) expect(s.end + 10 <= b.start || s.start >= b.end + 10).toBe(true);
    }
    expect(slots.map((s) => s.distance)).toEqual([...slots.map((s) => s.distance)].sort((a, b) => a - b));
  });

  it('says so when nothing fits, rather than double-booking', () => {
    const full = [...EXISTING, { staff: 'Maya', start: 14 * 60, end: 16 * 60 + 30, label: 'Colour' }];
    expect(findSlots('colour', 'Maya', 14 * 60, full)).toEqual([]);
  });

  it('confirms with reminders and a rebooking nudge', () => {
    const [slot] = findSlots('cut', 'Jordan', 13 * 60);
    const c = confirmation('cut', slot!);
    expect(c.reminders).toHaveLength(2);
    expect(c.followUp.when).toBe('5 weeks after');
  });
});

describe('inventory', () => {
  it('drafts orders for items at their reorder point, in case packs, grouped by supplier', () => {
    const state = initialState();
    const drafts = draftOrders(state, 3);
    for (const d of drafts) for (const l of d.lines) {
      expect(l.stock).toBeLessThanOrEqual(reorderPoint(l.sku, 3));
      expect(l.qty % l.sku.casePack).toBe(0);
      expect(l.sku.supplier).toBe(d.supplier);
    }
    expect(drafts.flatMap((d) => d.lines.map((l) => l.sku.sku))).toContain('KTL-GLS-1L');
  });

  it('sells stock day by day and receives approved orders on time', () => {
    let state = initialState();
    const kettle = SKUS.find((s) => s.sku === 'KTL-GLS-1L')!;
    const order = draftOrders(state, 3).find((d) => d.supplier === kettle.supplier)!;
    const approved = approve(state, order);
    state = simulateDay(state, approved);
    expect(state.open.length).toBe(approved.length);
    // Nothing already on order is drafted twice.
    expect(draftOrders(state, 3).flatMap((d) => d.lines).some((l) => l.sku.sku === 'KTL-GLS-1L')).toBe(false);
    for (let i = 1; i < kettle.leadDays; i++) state = simulateDay(state);
    expect(state.open.some((o) => o.sku === 'KTL-GLS-1L')).toBe(false);
  });
});

describe('prospect qualification', () => {
  it('scores against the profile and explains every point', () => {
    for (const p of PROSPECTS) {
      const s = score(p, DEFAULT_PROFILE);
      expect(s.score).toBe(s.reasons.reduce((t, r) => t + r.points, 0));
      expect(s.qualified).toBe(s.score >= DEFAULT_PROFILE.threshold);
      expect(Boolean(s.opener)).toBe(s.qualified);
    }
    const { scored, qualified } = rank(DEFAULT_PROFILE);
    expect(scored[0]!.score).toBe(100);
    expect(scored.find((s) => s.name === 'Westbrook Supply Co.')!.qualified).toBe(false); // outside the target area
    expect(qualified).toBeGreaterThan(0);
    expect(rank({ ...DEFAULT_PROFILE, threshold: 101 }).qualified).toBe(0);
  });
});

describe('catalogue', () => {
  it('has a demo for every industry in the showcase', () => {
    const slugs = new Set(DEMOS.map((d) => d.slug));
    for (const i of INDUSTRIES) expect(slugs.has(i.demo)).toBe(true);
  });
});
