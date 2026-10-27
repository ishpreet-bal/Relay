'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Pause, Play, RotateCcw } from 'lucide-react';
import { clock, DAY_END, DAY_START, dispatchSummary, SHIPMENTS, stateAt, updatesBetween, type Status } from '@/site/demos/shipments';
import { Badge, Frame, Panel, Stat } from './ui';

const TONE: Record<Status, 'muted' | 'info' | 'warn' | 'bad' | 'good'> = {
  Scheduled: 'muted', 'In transit': 'info', 'At risk': 'warn', Delayed: 'bad', Delivered: 'good',
};

export function ShipmentsDemo() {
  const [minute, setMinute] = useState(9 * 60);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setMinute((m) => Math.min(DAY_END, m + 15)), 450);
    return () => clearInterval(t);
  }, [playing]);
  useEffect(() => { if (minute >= DAY_END) setPlaying(false); }, [minute]);

  const summary = useMemo(() => dispatchSummary(minute), [minute]);
  const updates = useMemo(() => updatesBetween(DAY_START - 1, minute).reverse(), [minute]);

  return (
    <Frame title="Dispatch board · Southern Ontario">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { if (minute >= DAY_END) setMinute(DAY_START); setPlaying((p) => !p); }} className="s-btn-primary h-10 px-4 text-[0.88rem]">
          {playing ? <><Pause className="size-4" />Pause</> : <><Play className="size-4" />Play the day</>}
        </button>
        <button type="button" onClick={() => { setPlaying(false); setMinute(DAY_START); }} className="s-btn-quiet h-10 px-4 text-[0.88rem]"><RotateCcw className="size-4" />Reset</button>
        <label className="flex-1 min-w-[220px]">
          <span className="flex justify-between s-label"><span>Time of day</span><span className="text-site-night tabular">{clock(minute)}</span></span>
          <input type="range" min={DAY_START} max={DAY_END} step={15} value={minute} onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }} className="mt-2 w-full accent-site-signal" />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.keys(summary.counts) as Status[]).map((s) => <Stat key={s} label={s} value={summary.counts[s]} tone={s === 'Delivered' ? 'good' : s === 'Delayed' ? 'bad' : s === 'At risk' ? 'warn' : undefined} />)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Panel title="Shipments" className="lg:col-span-7" aside={<span className="s-label">{summary.events} scan events so far</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[0.84rem] tabular">
              <thead><tr className="text-left s-label"><th className="py-2 pr-3">Shipment</th><th className="py-2 pr-3">Route</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">ETA / promised</th></tr></thead>
              <tbody>
                {SHIPMENTS.map((s) => {
                  const st = stateAt(s, minute);
                  return (
                    <tr key={s.id} className="border-t border-site-rule align-top">
                      <td className="py-2.5 pr-3"><span className="font-mono">{s.id}</span><span className="block text-[0.75rem] text-site-fog">{s.customer}</span></td>
                      <td className="py-2.5 pr-3">{s.from} → {s.to}<span className="block text-[0.75rem] text-site-fog">{st.lastEvent ? `${st.lastEvent.place}${st.lastEvent.note ? ` · ${st.lastEvent.note}` : ''}` : 'Not departed'}</span></td>
                      <td className="py-2.5 pr-3"><Badge tone={TONE[st.status]}>{st.status}</Badge></td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{clock(st.eta)}<span className="block text-[0.75rem] text-site-fog">by {clock(s.promisedBy)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Customer updates" className="lg:col-span-5" aside={<Badge tone="info">{summary.updates} written</Badge>}>
          {updates.length === 0 ? <p className="text-[0.9rem] text-site-fog">No status changes yet. Press play.</p> : (
            <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {updates.map((u) => (
                <li key={`${u.shipment}-${u.at}`} className="rounded-xl border border-site-rule bg-site-paper/60 p-3 s-rise">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[0.8rem] font-medium"><MessageSquareText className="size-3.5 text-site-signal" />{u.customer}</span>
                    <span className="font-mono text-[0.72rem] text-site-fog">{clock(u.at)}</span>
                  </div>
                  <p className="mt-1.5 text-[0.84rem] leading-snug">{u.message}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 s-label">One message per status change; routine scans stay quiet. Nothing is sent from this demo.</p>
        </Panel>
      </div>
    </Frame>
  );
}
