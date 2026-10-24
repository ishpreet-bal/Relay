'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus, Check, MessageSquareText } from 'lucide-react';
import { CLOSE, confirmation, EXISTING, findSlots, OPEN, SERVICES, STAFF, time, type ServiceId, type Slot } from '@/site/demos/booking';
import { Badge, ChoiceChips, Frame, Panel } from './ui';

const HOURS = Array.from({ length: (CLOSE - OPEN) / 60 }, (_, i) => OPEN + i * 60);
const PX = 0.8; // pixels per minute on the day view

export function BookingDemo() {
  const [service, setService] = useState<ServiceId>('colour');
  const [staff, setStaff] = useState<string>('any');
  const [preferred, setPreferred] = useState(14 * 60);
  const [booked, setBooked] = useState<{ service: ServiceId; slot: Slot } | null>(null);

  const svc = SERVICES[service];
  const staffOptions = ['any', ...svc.staff];
  const effectiveStaff = staffOptions.includes(staff) ? staff : 'any';
  const slots = useMemo(() => findSlots(service, effectiveStaff, preferred), [service, effectiveStaff, preferred]);
  const conf = booked ? confirmation(booked.service, booked.slot) : null;

  const day = [...EXISTING.map((b) => ({ ...b, mine: false })), ...(booked ? [{ staff: booked.slot.staff, start: booked.slot.start, end: booked.slot.end, label: SERVICES[booked.service].label, mine: true }] : [])];

  return (
    <Frame title="Online booking · Juniper Studio (fictional)">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-4">
          <Panel title="1 · The customer asks">
            <div className="space-y-4">
              <ChoiceChips label="Service" value={[service]} onChange={(v) => { setService(v[0]!); setBooked(null); }}
                options={(Object.keys(SERVICES) as ServiceId[]).map((k) => ({ value: k, label: `${SERVICES[k].label} · ${SERVICES[k].minutes} min` }))} />
              <ChoiceChips label="With" value={[effectiveStaff]} onChange={(v) => { setStaff(v[0]!); setBooked(null); }}
                options={staffOptions.map((s) => ({ value: s, label: s === 'any' ? 'Anyone available' : s }))} />
              <label className="block">
                <span className="s-label">Preferred time</span>
                <select value={preferred} onChange={(e) => { setPreferred(Number(e.target.value)); setBooked(null); }} className="s-field mt-2 h-10 text-[0.9rem]">
                  {Array.from({ length: 17 }, (_, i) => OPEN + i * 30).map((m) => <option key={m} value={m}>{time(m)}</option>)}
                </select>
              </label>
            </div>
          </Panel>

          <Panel title="2 · Options that fit" aside={<span className="s-label">with {10} min cleanup</span>}>
            {slots.length === 0 ? (
              <p className="text-[0.9rem] text-site-fog">No gap long enough today. A real system would offer the next available day.</p>
            ) : (
              <ul className="space-y-2">
                {slots.map((s) => {
                  const chosen = booked?.slot.start === s.start && booked.slot.staff === s.staff;
                  return (
                    <li key={`${s.staff}-${s.start}`}>
                      <button type="button" onClick={() => setBooked({ service, slot: s })} aria-pressed={chosen}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${chosen ? 'border-site-signal bg-site-signal/[0.06]' : 'border-site-rule bg-white hover:border-site-night/40'}`}>
                        <span><span className="font-medium tabular">{time(s.start)} – {time(s.end)}</span><span className="block text-[0.8rem] text-site-fog">with {s.staff}{s.distance ? ` · ${s.distance} min from your preferred time` : ' · your preferred time'}</span></span>
                        {chosen ? <Badge tone="good"><Check className="size-3 mr-1" />Booked</Badge> : <CalendarPlus className="size-4 text-site-fog" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <Panel title="3 · Saturday’s calendar">
            <div className="grid grid-cols-[3.2rem_repeat(3,1fr)] gap-x-2">
              <span />
              {STAFF.map((s) => <span key={s} className="pb-2 text-center s-label">{s}</span>)}
              <div className="relative" style={{ height: `${(CLOSE - OPEN) * PX}px` }}>
                {HOURS.map((h) => <span key={h} className="absolute right-1 -translate-y-1/2 font-mono text-[0.66rem] text-site-fog" style={{ top: `${(h - OPEN) * PX}px` }}>{time(h).replace(':00', '')}</span>)}
              </div>
              {STAFF.map((s) => (
                <div key={s} className="relative rounded-lg bg-site-paper/70 border border-site-rule" style={{ height: `${(CLOSE - OPEN) * PX}px` }}>
                  {HOURS.map((h) => <span key={h} className="absolute inset-x-0 border-t border-dashed border-site-rule" style={{ top: `${(h - OPEN) * PX}px` }} />)}
                  {day.filter((b) => b.staff === s).map((b) => (
                    <span key={`${b.start}-${b.label}`} className={`absolute inset-x-1 rounded-md px-1.5 py-1 text-[0.68rem] leading-tight overflow-hidden ${b.mine ? 'bg-site-signal text-white s-rise shadow-[0_8px_20px_-10px_rgba(36,80,240,0.9)]' : 'bg-site-sand text-site-fog border border-site-rule'}`}
                      style={{ top: `${(b.start - OPEN) * PX + 1}px`, height: `${(b.end - b.start) * PX - 2}px` }}>
                      {b.end - b.start >= 60
                        ? <>{b.label}<span className="block opacity-80">{time(b.start)}</span></>
                        : <span className="block truncate">{b.label} · {time(b.start)}</span>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="4 · Messages the customer receives" aside={<MessageSquareText className="size-4 text-site-fog" />}>
            {!conf ? <p className="text-[0.9rem] text-site-fog">Pick an option to book it.</p> : (
              <ol className="space-y-2">
                <li className="rounded-xl border border-site-rule bg-site-paper/60 p-3"><p className="s-label">Now · confirmation</p><p className="mt-1 text-[0.88rem]">{conf.message}</p></li>
                {conf.reminders.map((r) => <li key={r.when} className="rounded-xl border border-site-rule bg-site-paper/60 p-3"><p className="s-label">{r.when}</p><p className="mt-1 text-[0.88rem]">{r.text}</p></li>)}
                <li className="rounded-xl border border-site-rule bg-site-paper/60 p-3"><p className="s-label">{conf.followUp.when} · rebooking</p><p className="mt-1 text-[0.88rem]">{conf.followUp.text}</p></li>
              </ol>
            )}
            <p className="mt-2 s-label">Scheduled automatically. Nothing is sent from this demo.</p>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}
