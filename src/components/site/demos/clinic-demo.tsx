'use client';

import { useMemo, useState } from 'react';
import { BellRing, Info, Plus } from 'lucide-react';
import { REMINDER_RULES, reminderPlan, reminderText, route, SAMPLE_ITEMS, TOMORROW, type AdminItem, type Queue } from '@/site/demos/clinic';
import { Badge, Frame, Panel } from './ui';

const QUEUES: Queue[] = ['Scheduling', 'Records', 'Billing', 'Front desk', 'Clinical team'];

export function ClinicDemo() {
  const [items, setItems] = useState<AdminItem[]>(SAMPLE_ITEMS);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState<string[]>(['24h', '2h']);
  const routed = useMemo(() => items.map(route), [items]);
  const plan = reminderPlan(enabled);
  const preview = plan.rules[0];

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() && !body.trim()) return;
    setItems((list) => [...list, { id: `IN-${210 + list.length}`, channel: 'Web form', subject: subject.trim() || '(no subject)', body: body.trim() }]);
    setSubject('');
    setBody('');
  };

  return (
    <Frame title="Front desk · Brightside Clinic (fictional)">
      <p className="mb-4 flex gap-2 rounded-xl bg-site-sand/70 px-3.5 py-2.5 text-[0.84rem] leading-snug text-site-fog">
        <Info className="size-4 shrink-0 mt-0.5" />Administrative workflow only, with fictional records. Not clinical software, and not a statement of regulatory or privacy compliance.
      </p>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-4">
          <Panel title="Incoming" aside={<Badge>{items.length} items</Badge>}>
            <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {routed.map((r) => (
                <li key={r.id} className="rounded-xl border border-site-rule px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-[0.86rem] font-medium">{r.subject}</span><span className="font-mono text-[0.7rem] text-site-fog">{r.channel}</span></div>
                  <p className="mt-1 text-[0.78rem] leading-snug text-site-fog line-clamp-2">{r.body}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Try one of your own">
            <form onSubmit={add} className="space-y-2">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Subject, e.g. “Cancel my Friday appointment”" className="s-field h-10 text-[0.88rem]" aria-label="Subject" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={400} rows={2} placeholder="Message (fictional details only)" className="s-field h-auto py-2.5 text-[0.88rem]" aria-label="Message" />
              <button type="submit" className="s-btn-quiet h-10 w-full text-[0.86rem]"><Plus className="size-4" />Route it</button>
            </form>
          </Panel>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {QUEUES.map((q) => {
              const list = routed.filter((r) => r.queue === q);
              return (
                <Panel key={q} title={q} aside={<Badge tone={q === 'Clinical team' ? 'warn' : list.length ? 'info' : 'muted'}>{list.length}</Badge>}>
                  {list.length === 0 ? <p className="text-[0.82rem] text-site-fog">Nothing waiting.</p> : (
                    <ul className="space-y-2">
                      {list.map((r) => (
                        <li key={r.id} className="rounded-xl bg-site-paper/70 px-3 py-2 s-rise">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[0.82rem] font-medium">{r.type}</span>
                            <Badge tone={r.priority === 'Today' ? 'bad' : r.priority === 'This week' ? 'warn' : 'muted'}>{r.priority}</Badge>
                          </div>
                          <p className="mt-1 text-[0.76rem] leading-snug text-site-fog">{r.subject} · {r.reason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              );
            })}
          </div>

          <Panel title="Tomorrow’s reminders" aside={<BellRing className="size-4 text-site-fog" />}>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_RULES.map((r) => {
                const on = enabled.includes(r.key);
                return (
                  <button key={r.key} type="button" aria-pressed={on} onClick={() => setEnabled((e) => (on ? e.filter((k) => k !== r.key) : [...e, r.key]))}
                    className={`rounded-full border px-3 h-8 text-[0.8rem] transition-colors ${on ? 'border-site-night bg-site-night text-site-paper' : 'border-site-rule bg-white'}`}>
                    {r.label} · {r.channel}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[0.86rem]">{plan.total} reminders scheduled for {TOMORROW.length} appointments ({plan.perPatient} each).</p>
            {preview && (
              <div className="mt-3 rounded-xl border border-site-rule bg-site-paper/60 p-3">
                <p className="s-label">{preview.channel} · {preview.label} · to {TOMORROW[1]!.patient}</p>
                <p className="mt-1.5 text-[0.88rem]">{reminderText(TOMORROW[1]!, preview.key)}</p>
              </div>
            )}
            <p className="mt-2 s-label">Reminders carry the time and place only: no reason for the visit. Nothing is sent from this demo.</p>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}
