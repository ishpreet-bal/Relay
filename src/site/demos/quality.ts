import { round, seeded } from './random';

/**
 * Manufacturing demo: inspection records from three lines, in three formats,
 * validated, consolidated and turned into a yield report. Sample data only.
 */

export type Line = 'A' | 'B' | 'C';
export type InspectionRecord = {
  id: string;
  line: Line;
  shift: 'Day' | 'Night';
  source: string;
  measured: number | null;
  unit: 'mm' | 'in';
  defect: string;
};

export const PART = { name: 'Bearing housing BH-220', nominalMm: 42 };

const SOURCES: Record<Line, string> = {
  A: 'line-a-export.csv',
  B: 'Line B inspection.xlsx',
  C: 'Emailed sheet from Line C',
};

const DEFECTS = ['Burr', 'Scratch', 'Porosity'] as const;

/** Thirty-six sample inspections, with the kinds of problems real files have. */
export function sampleRecords(): InspectionRecord[] {
  const rand = seeded(4220);
  const out: InspectionRecord[] = [];
  const spread: Record<Line, number> = { A: 0.022, B: 0.034, C: 0.026 };
  (['A', 'B', 'C'] as Line[]).forEach((line) => {
    for (let i = 0; i < 12; i++) {
      const offset = (rand() - 0.5) * 2 * spread[line] * 1.6;
      const defectRoll = rand();
      out.push({
        id: `${line}-${String(i + 1).padStart(3, '0')}`,
        line,
        shift: i < 6 ? 'Day' : 'Night',
        source: SOURCES[line],
        measured: round(PART.nominalMm + offset, 3),
        unit: 'mm',
        defect: defectRoll > (line === 'B' ? 0.82 : 0.97) ? DEFECTS[Math.floor(rand() * DEFECTS.length)]! : 'None',
      });
    }
  });
  // What arrives in practice: a blank cell, a sheet in inches, a typo.
  const b7 = out.find((r) => r.id === 'B-007')!;
  b7.measured = null;
  for (const id of ['C-003', 'C-009']) {
    const r = out.find((x) => x.id === id)!;
    r.measured = round(r.measured! / 25.4, 4);
    r.unit = 'in';
  }
  const c11 = out.find((r) => r.id === 'C-011')!;
  c11.defect = 'porosty';
  return out;
}

export type ValidatedRecord = InspectionRecord & { measuredMm: number | null; defectClean: string; notes: string[]; usable: boolean };

const DEFECT_FIXES: Record<string, string> = { porosty: 'Porosity', porosity: 'Porosity', burr: 'Burr', scratch: 'Scratch', none: 'None', '': 'None' };

export function validate(records: InspectionRecord[]): ValidatedRecord[] {
  return records.map((r) => {
    const notes: string[] = [];
    let measuredMm = r.measured;
    if (measuredMm == null) notes.push('Measurement missing: sent back for re-inspection');
    else if (r.unit === 'in') {
      measuredMm = round(measuredMm * 25.4, 3);
      notes.push('Recorded in inches: converted to mm');
    }
    const key = r.defect.trim().toLowerCase();
    const defectClean = DEFECT_FIXES[key] ?? r.defect;
    if (defectClean !== r.defect) notes.push(`Defect “${r.defect}” standardized to “${defectClean}”`);
    return { ...r, measuredMm, defectClean, notes, usable: measuredMm != null };
  });
}

export type LineSummary = {
  line: Line;
  inspected: number;
  passed: number;
  yield: number;
  outOfTolerance: number;
  defects: Record<string, number>;
  belowTarget: boolean;
};

export type QualityReport = {
  lines: LineSummary[];
  overall: { inspected: number; passed: number; yield: number };
  excluded: number;
  corrected: number;
  pareto: { issue: string; count: number }[];
  alerts: string[];
  summary: string;
};

export function buildReport(records: ValidatedRecord[], opts: { toleranceMm: number; targetYield: number }): QualityReport {
  const usable = records.filter((r) => r.usable);
  const issues = new Map<string, number>();
  const lines: LineSummary[] = (['A', 'B', 'C'] as Line[]).map((line) => {
    const rows = usable.filter((r) => r.line === line);
    let passed = 0;
    let outOfTolerance = 0;
    const defects: Record<string, number> = {};
    for (const r of rows) {
      const inTol = Math.abs(r.measuredMm! - PART.nominalMm) <= opts.toleranceMm + 1e-9;
      if (!inTol) {
        outOfTolerance++;
        issues.set('Out of tolerance', (issues.get('Out of tolerance') ?? 0) + 1);
      }
      if (r.defectClean !== 'None') {
        defects[r.defectClean] = (defects[r.defectClean] ?? 0) + 1;
        issues.set(r.defectClean, (issues.get(r.defectClean) ?? 0) + 1);
      }
      if (inTol && r.defectClean === 'None') passed++;
    }
    const y = rows.length ? passed / rows.length : 0;
    return { line, inspected: rows.length, passed, yield: y, outOfTolerance, defects, belowTarget: y < opts.targetYield };
  });
  const inspected = lines.reduce((s, l) => s + l.inspected, 0);
  const passed = lines.reduce((s, l) => s + l.passed, 0);
  const pareto = [...issues.entries()].map(([issue, count]) => ({ issue, count })).sort((a, b) => b.count - a.count || a.issue.localeCompare(b.issue));
  const fmt = (n: number) => `${round(n * 100, 1).toFixed(1)}%`;
  const alerts = lines.filter((l) => l.belowTarget).map((l) => `Line ${l.line} first-pass yield ${fmt(l.yield)} (${l.passed} of ${l.inspected}), below the ${fmt(opts.targetYield)} target.`);
  const top = pareto[0];
  const summary = [
    `${inspected} parts inspected across three lines; ${passed} passed first time (${fmt(inspected ? passed / inspected : 0)}).`,
    alerts.length ? alerts.join(' ') : `Every line met the ${fmt(opts.targetYield)} target.`,
    top ? `Most common issue: ${top.issue.toLowerCase()} (${top.count}).` : 'No issues recorded.',
  ].join(' ');
  return {
    lines,
    overall: { inspected, passed, yield: inspected ? passed / inspected : 0 },
    excluded: records.length - usable.length,
    corrected: records.filter((r) => r.usable && r.notes.length).length,
    pareto,
    alerts,
    summary,
  };
}
