'use client';

import { useMemo, useState } from 'react';
import { PackageCheck, RotateCcw, SkipForward, Truck } from 'lucide-react';
import { approve, daysLeft, draftOrders, initialState, reorderPoint, simulateDay, SKUS, type Order, type State } from '@/site/demos/inventory';
import { money } from '@/site/demos/random';
import { Badge, Bar, Frame, Panel, Range, Stat } from './ui';

export function InventoryDemo() {
  const [state, setState] = useState<State>(() => initialState());
  const [pending, setPending] = useState<Order[]>([]);
  const [safety, setSafety] = useState(3);
  const drafts = useMemo(() => draftOrders({ ...state, open: [...state.open, ...pending] }, safety), [state, pending, safety]);
  const onOrder = [...state.open, ...pending];
  const lost = Object.values(state.soldOut).reduce((a, b) => a + b, 0);

  const nextDay = () => { setState((s) => simulateDay(s, pending)); setPending([]); };
  const reset = () => { setState(initialState()); setPending([]); };

  return (
    <Frame title="Inventory · Northshore Tea Co. (fictional)">
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={nextDay} className="s-btn-primary h-10 px-4 text-[0.88rem]"><SkipForward className="size-4" />Next day of sales</button>
        <button type="button" onClick={reset} className="s-btn-quiet h-10 px-4 text-[0.88rem]"><RotateCcw className="size-4" />Reset</button>
        <div className="flex-1 min-w-[220px]"><Range label="Safety stock" value={safety} min={0} max={7} step={1} onChange={setSafety} format={(v) => `${v} day${v === 1 ? '' : 's'}`} /></div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Day" value={state.day} />
        <Stat label="On order" value={onOrder.length} />
        <Stat label="Sales missed (units)" value={lost} tone={lost ? 'bad' : 'good'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Panel title="Stock" className="lg:col-span-7">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[0.84rem] tabular">
              <thead><tr className="text-left s-label"><th className="py-2 pr-3">Product</th><th className="py-2 pr-3">Stock</th><th className="py-2 pr-3 w-[30%]">Days left</th><th className="py-2 pr-3">Status</th></tr></thead>
              <tbody>
                {SKUS.map((s) => {
                  const stock = state.stock[s.sku] ?? 0;
                  const left = daysLeft(s, stock);
                  const point = reorderPoint(s, safety);
                  const ordered = onOrder.some((o) => o.sku === s.sku);
                  const status = stock === 0 ? 'Sold out' : ordered ? 'On order' : stock <= point ? 'Reorder' : 'OK';
                  return (
                    <tr key={s.sku} className="border-t border-site-rule">
                      <td className="py-2.5 pr-3">{s.name}<span className="block text-[0.72rem] text-site-fog">{s.supplier} · {s.leadDays}-day lead time</span></td>
                      <td className="py-2.5 pr-3">{stock}<span className="block text-[0.72rem] text-site-fog">reorder at {point}</span></td>
                      <td className="py-2.5 pr-3"><Bar value={Math.min(1, left / 30)} tone={left <= s.leadDays ? 'bad' : left <= s.leadDays + safety ? 'warn' : 'good'} /><span className="mt-1 block text-[0.72rem] text-site-fog">{Number.isFinite(left) ? `${left.toFixed(1)} days` : '—'}</span></td>
                      <td className="py-2.5 pr-3"><Badge tone={status === 'Sold out' ? 'bad' : status === 'Reorder' ? 'warn' : status === 'On order' ? 'info' : 'good'}>{status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="lg:col-span-5 space-y-4">
          <Panel title="Draft purchase orders" aside={<Badge tone={drafts.length ? 'warn' : 'good'}>{drafts.length}</Badge>}>
            {drafts.length === 0 ? <p className="text-[0.9rem] text-site-fog">Nothing needs reordering right now.</p> : (
              <ul className="space-y-3">
                {drafts.map((d) => (
                  <li key={d.supplier} className="rounded-xl border border-site-rule p-3.5 s-rise">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium text-[0.9rem]">{d.supplier}</span><span className="tabular text-[0.88rem]">{money(d.totalCents)}</span></div>
                    <ul className="mt-2 space-y-1 text-[0.8rem] text-site-fog">
                      {d.lines.map((l) => <li key={l.sku.sku} className="flex justify-between gap-2"><span>{l.sku.name}</span><span className="tabular">{l.qty} units</span></li>)}
                    </ul>
                    <button type="button" onClick={() => setPending((p) => [...p, ...approve(state, d)])} className="mt-3 s-btn-quiet h-9 w-full text-[0.82rem]">
                      <PackageCheck className="size-4" />Approve order
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 s-label">Quantities cover lead time plus two weeks, rounded to case packs.</p>
          </Panel>
          {onOrder.length > 0 && (
            <Panel title="On the way" aside={<Truck className="size-4 text-site-fog" />}>
              <ul className="space-y-1.5 text-[0.82rem]">
                {onOrder.map((o) => <li key={`${o.sku}-${o.arrivesDay}`} className="flex justify-between gap-2"><span>{SKUS.find((s) => s.sku === o.sku)!.name}</span><span className="tabular text-site-fog">{o.qty} · arrives day {o.arrivesDay}</span></li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </Frame>
  );
}
