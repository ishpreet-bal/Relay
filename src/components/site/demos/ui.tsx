'use client';

/** Small building blocks shared by the demo applications. */

export function Frame({ title, status = 'Sample data', children, className = '' }: { title: string; status?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[24px] border border-site-rule bg-site-chalk shadow-[0_40px_80px_-50px_rgba(11,18,32,0.45)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-site-rule bg-white/70 px-4 sm:px-5 py-3">
        <p className="font-medium text-[0.92rem] truncate">{title}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-site-rule bg-site-paper px-2.5 h-7 s-label"><span className="size-1.5 rounded-full bg-site-coral" />{status}</span>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

export function Panel({ title, aside, children, className = '' }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-site-rule bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="s-label">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-[#0B7F71]' : tone === 'warn' ? 'text-[#A8590F]' : tone === 'bad' ? 'text-[#B4382A]' : 'text-site-night';
  return (
    <div className="rounded-xl border border-site-rule bg-site-paper/60 px-3.5 py-3">
      <p className="s-label">{label}</p>
      <p className={`mt-1 font-serif text-[1.55rem] leading-none tracking-[-0.02em] tabular ${color}`}>{value}</p>
    </div>
  );
}

const BADGE: Record<string, string> = {
  good: 'bg-[#0FB5A0]/10 text-[#0B6E62] border-[#0FB5A0]/30',
  warn: 'bg-[#F0A23A]/15 text-[#8A4A08] border-[#F0A23A]/35',
  bad: 'bg-[#FF7A59]/15 text-[#9C3220] border-[#FF7A59]/35',
  info: 'bg-site-signal/[0.08] text-site-signal border-site-signal/25',
  muted: 'bg-site-sand text-site-fog border-site-rule',
};

export function Badge({ tone = 'muted', children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 h-6 text-[0.72rem] font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function Range({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between s-label"><span>{label}</span><span className="text-site-night tabular">{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-site-signal h-2 cursor-pointer" />
    </label>
  );
}

export function ChoiceChips<T extends string>({ label, options, value, onChange, multi = false }: {
  label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; multi?: boolean;
}) {
  return (
    <fieldset>
      <legend className="s-label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={on}
              onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
              className={`rounded-full border px-3 h-8 text-[0.8rem] transition-colors ${on ? 'border-site-night bg-site-night text-site-paper' : 'border-site-rule bg-white hover:border-site-night/40'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Bar({ value, target, tone = 'info' }: { value: number; target?: number; tone?: 'info' | 'good' | 'bad' | 'warn' }) {
  const fill = tone === 'good' ? 'bg-site-tide' : tone === 'bad' ? 'bg-site-coral' : tone === 'warn' ? 'bg-[#F0A23A]' : 'bg-site-signal';
  return (
    <div className="relative h-2.5 rounded-full bg-site-sand overflow-hidden" role="presentation">
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500 ease-out`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {target != null && <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-site-night" style={{ left: `${target * 100}%` }} title="Target" />}
    </div>
  );
}

export function DraftNote({ children = 'Draft for review. Nothing is sent from this demo.' }: { children?: React.ReactNode }) {
  return <p className="mt-2 s-label">{children}</p>;
}
