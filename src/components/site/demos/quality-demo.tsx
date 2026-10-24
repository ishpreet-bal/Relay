'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Mail } from 'lucide-react';
import { buildReport, PART, sampleRecords, validate, type InspectionRecord } from '@/site/demos/quality';
import { percent } from '@/site/demos/random';
import { Badge, Bar, DraftNote, Frame, Panel, Range, Stat } from './ui';

export function QualityDemo() {
  const [tolerance, setTolerance] = useState(0.05);
  const [target, setTarget] = useState(0.95);
  const [reinspection, setReinspection] = useState('');
  const [showAll, setShowAll] = useState(false);

  const raw = useMemo(() => sampleRecords(), []);
  const records = useMemo(() => {
    const n = Number(reinspection);
    const fixed: InspectionRecord[] = raw.map((r) => (r.id === 'B-007' && reinspection && Number.isFinite(n) ? { ...r, measured: n } : r));
    return validate(fixed);
  }, [raw, reinspection]);
  const report = useMemo(() => buildReport(records, { toleranceMm: tolerance, targetYield: target }), [records, tolerance, target]);
  const flagged = records.filter((r) => r.notes.length);
  const rows = showAll ? records : records.filter((r) => r.notes.length || ['A-001', 'A-002', 'B-001', 'B-002'].includes(r.id));

  return (
    <Frame title={`Quality report · ${PART.name}`}>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-4">
          <Panel title="1 · Files collected">
            <ul className="space-y-2">
              {['line-a-export.csv', 'Line B inspection.xlsx', 'Emailed sheet from Line C'].map((f, i) => (
                <li key={f} className="flex items-center justify-between gap-3 rounded-xl border border-site-rule px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-[0.88rem]"><FileSpreadsheet className="size-4 text-site-signal" />{f}</span>
                  <Badge>{12} rows · Line {'ABC'[i]}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="2 · Validation" aside={<Badge tone={flagged.length ? 'warn' : 'good'}>{flagged.length} handled</Badge>}>
            <ul className="space-y-2">
              {flagged.map((r) => (
                <li key={r.id} className="rounded-xl bg-site-paper/70 px-3 py-2.5 text-[0.85rem] leading-snug">
                  <span className="font-mono text-[0.75rem] text-site-fog mr-2">{r.id}</span>{r.notes.join('; ')}
                </li>
              ))}
            </ul>
            <label className="mt-4 block">
              <span className="s-label">Enter B-007’s re-inspection result (mm) to include it</span>
              <input inputMode="decimal" value={reinspection} onChange={(e) => setReinspection(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="e.g. 42.01" className="s-field mt-2 h-10 font-mono text-[0.9rem]" />
            </label>
          </Panel>

          <Panel title="Settings">
            <div className="space-y-5">
              <Range label={`Tolerance on ${PART.nominalMm.toFixed(2)} mm`} value={tolerance} min={0.02} max={0.1} step={0.01} onChange={setTolerance} format={(v) => `± ${v.toFixed(2)} mm`} />
              <Range label="First-pass yield target" value={target} min={0.85} max={0.99} step={0.01} onChange={setTarget} format={(v) => percent(v, 0)} />
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Inspected" value={report.overall.inspected} />
            <Stat label="Passed first time" value={report.overall.passed} />
            <Stat label="Overall yield" value={percent(report.overall.yield)} tone={report.overall.yield >= target ? 'good' : 'bad'} />
          </div>

          <Panel title="3 · Yield by line" aside={<span className="s-label">bar = yield · line = target</span>}>
            <ul className="space-y-4">
              {report.lines.map((l) => (
                <li key={l.line}>
                  <div className="flex items-center justify-between text-[0.88rem] mb-1.5">
                    <span className="font-medium">Line {l.line}</span>
                    <span className="flex items-center gap-2 tabular">
                      {l.passed} of {l.inspected} · {percent(l.yield)}
                      <Badge tone={l.belowTarget ? 'bad' : 'good'}>{l.belowTarget ? 'Below target' : 'On target'}</Badge>
                    </span>
                  </div>
                  <Bar value={l.yield} target={target} tone={l.belowTarget ? 'bad' : 'good'} />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Issues, most common first">
            {report.pareto.length === 0 ? <p className="text-[0.9rem] text-site-fog">No issues at this tolerance.</p> : (
              <ul className="space-y-2">
                {report.pareto.map((p) => (
                  <li key={p.issue} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-[0.86rem]">
                    <span>{p.issue}</span>
                    <Bar value={p.count / Math.max(...report.pareto.map((x) => x.count))} tone="warn" />
                    <span className="text-right tabular">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="4 · Report to the quality lead" aside={<Mail className="size-4 text-site-fog" />}>
            {report.alerts.map((a) => (
              <p key={a} className="mb-2 flex gap-2 rounded-xl bg-[#FF7A59]/10 px-3 py-2 text-[0.86rem] text-[#8A2E1C]"><AlertTriangle className="size-4 shrink-0 mt-0.5" />{a}</p>
            ))}
            <p className="text-[0.92rem] leading-relaxed">{report.summary}</p>
            <DraftNote />
          </Panel>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-site-rule bg-white" open={showAll} onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer list-none px-5 py-3.5 s-label [&::-webkit-details-marker]:hidden">{showAll ? 'Hide' : 'Show'} the records ({records.length})</summary>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full min-w-[560px] text-[0.82rem] tabular">
            <thead><tr className="text-left s-label"><th className="px-3 py-2">Record</th><th className="px-3 py-2">Shift</th><th className="px-3 py-2">As recorded</th><th className="px-3 py-2">Measured (mm)</th><th className="px-3 py-2">Defect</th><th className="px-3 py-2">Result</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const inTol = r.measuredMm != null && Math.abs(r.measuredMm - PART.nominalMm) <= tolerance + 1e-9;
                const pass = r.usable && inTol && r.defectClean === 'None';
                return (
                  <tr key={r.id} className="border-t border-site-rule">
                    <td className="px-3 py-2 font-mono">{r.id}</td>
                    <td className="px-3 py-2">{r.shift}</td>
                    <td className="px-3 py-2 font-mono text-site-fog">{r.measured == null ? 'blank' : `${r.measured} ${r.unit}`}</td>
                    <td className="px-3 py-2 font-mono">{r.measuredMm?.toFixed(3) ?? '—'}</td>
                    <td className="px-3 py-2">{r.defectClean}</td>
                    <td className="px-3 py-2">{!r.usable ? <Badge tone="warn">Re-inspect</Badge> : pass ? <Badge tone="good">Pass</Badge> : <Badge tone="bad">Fail</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Frame>
  );
}
