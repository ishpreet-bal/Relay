'use client';

import { useState } from 'react';
import {
  Monitor, Smartphone, AppWindow, Bell, CheckCircle2, Sparkles,
  TrendingUp, TrendingDown, Minus, Users, Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChartBlock } from './chart-block';
import { WorkflowDiagram } from './workflow-diagram';
import type { SolutionSpec } from '@/server/services/templates/spec';

type Device = 'browser' | 'desktop' | 'mobile';
type Tab = 'dashboard' | 'workflow' | 'portals' | 'assistant';

/**
 * The demo renderer. One component serves all thirteen industries, driven
 * entirely by the spec. The device frames are not decoration — the brief was
 * that a prospect should be able to picture using this, and "what does it look
 * like on my phone" is the first thing an owner asks.
 */
export function SolutionDemo({ spec, accent, title }: { spec: SolutionSpec; accent: string; title: string }) {
  const [device, setDevice] = useState<Device>('browser');
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div style={{ ['--demo-accent' as string]: accent }}>
      <div className="flex items-center gap-2 mb-4">
        <nav className="flex gap-1 flex-1" aria-label="Demo sections">
          {(['dashboard', 'workflow', 'portals', 'assistant'] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined}
                    className={cn('h-7 px-3 rounded-full text-micro capitalize transition-colors',
                      tab === t ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:bg-raised')}>
              {t}
            </button>
          ))}
        </nav>

        <div className="flex gap-0.5 p-0.5 rounded-md border border-hairline" role="group" aria-label="Device preview">
          {([
            { key: 'browser', icon: AppWindow, label: 'Browser' },
            { key: 'desktop', icon: Monitor, label: 'Desktop app' },
            { key: 'mobile', icon: Smartphone, label: 'Mobile' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button key={key} type="button" onClick={() => setDevice(key)} title={label} aria-label={label}
                    aria-pressed={device === key}
                    className={cn('size-7 grid place-items-center rounded transition-colors',
                      device === key ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised')}>
              <Icon className="size-3.5" strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>

      <DeviceFrame device={device} title={title}>
        {tab === 'dashboard' && <DashboardView spec={spec} compact={device === 'mobile'} />}
        {tab === 'workflow' && (
          <div className="p-4 space-y-4">
            {spec.workflows.map((w, i) => (
              <section key={i}>
                <h3 className="eyebrow mb-3">{w.title}</h3>
                <WorkflowDiagram workflow={w} />
              </section>
            ))}
          </div>
        )}
        {tab === 'portals' && <PortalsView spec={spec} />}
        {tab === 'assistant' && <AssistantView spec={spec} />}
      </DeviceFrame>

      <p className="text-[11px] text-muted mt-3">
        Sample data for demonstration. Figures are illustrative, not results from a named client.
      </p>
    </div>
  );
}

function DeviceFrame({ device, title, children }: { device: Device; title: string; children: React.ReactNode }) {
  if (device === 'mobile') {
    return (
      <div className="flex justify-center">
        <div className="w-[320px] rounded-[28px] border-[6px] border-ink/85 bg-canvas overflow-hidden shadow-pop">
          <div className="h-6 bg-ink/85 flex items-center justify-center">
            <div className="w-16 h-1 rounded-full bg-canvas/30" />
          </div>
          <div className="h-[520px] overflow-y-auto">{children}</div>
        </div>
      </div>
    );
  }

  if (device === 'desktop') {
    return (
      <div className="rounded-lg border border-hairline overflow-hidden shadow-pop bg-canvas">
        {/* Windows-style chrome, since most of these shops are Microsoft houses. */}
        <div className="h-8 bg-raised border-b border-hairline flex items-center px-3 gap-2">
          <span className="text-[11px] font-medium flex-1 truncate">{title}</span>
          <span className="flex gap-3 text-muted text-[11px]">
            <span aria-hidden>—</span><span aria-hidden>▢</span><span aria-hidden>✕</span>
          </span>
        </div>
        <div className="max-h-[620px] overflow-y-auto">{children}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-hairline overflow-hidden shadow-pop bg-canvas">
      <div className="h-9 bg-raised border-b border-hairline flex items-center px-3 gap-2">
        <span className="flex gap-1.5">
          {['#ef6b6b', '#e8a042', '#34bf84'].map((c) => (
            <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
          ))}
        </span>
        <span className="flex-1 mx-3 h-5 rounded bg-surface border border-hairline flex items-center px-2">
          <span className="num text-[10px] text-muted truncate">app.yourclient.ca/dashboard</span>
        </span>
      </div>
      <div className="max-h-[620px] overflow-y-auto">{children}</div>
    </div>
  );
}

function DashboardView({ spec, compact }: { spec: SolutionSpec; compact: boolean }) {
  return (
    <div className="p-4 space-y-4">
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
        {spec.kpis.map((kpi) => {
          const improving = kpi.delta === undefined ? null
            : kpi.goodDirection === 'up' ? kpi.delta > 0 : kpi.delta < 0;
          const Trend = kpi.delta === undefined ? Minus : improving ? TrendingUp : TrendingDown;
          return (
            <div key={kpi.label} className="card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5 leading-tight">{kpi.label}</p>
              <p className="num text-xl font-medium leading-none">
                {kpi.value}
                {kpi.unit && <span className="text-[11px] text-muted ml-0.5">{kpi.unit}</span>}
              </p>
              {kpi.delta !== undefined && (
                <p className={cn('num text-[11px] mt-1.5 flex items-center gap-1',
                  improving === null ? 'text-muted' : improving ? 'text-cleared' : 'text-blocked')}>
                  <Trend className="size-3" />
                  {kpi.delta > 0 ? '+' : ''}{kpi.delta}
                </p>
              )}
              {kpi.caption && <p className="text-[10px] text-muted mt-1 leading-tight">{kpi.caption}</p>}
            </div>
          );
        })}
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}>
        {spec.charts.map((chart) => <ChartBlock key={chart.id} chart={chart} />)}
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}>
        <section className="card p-3">
          <h4 className="eyebrow mb-2 flex items-center gap-1.5">
            <Bell className="size-3" /> Notifications
          </h4>
          <ul className="space-y-2">
            {spec.notifications.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className={cn('mt-1 size-1.5 rounded-full shrink-0',
                  n.tone === 'blocked' && 'bg-blocked', n.tone === 'held' && 'bg-held',
                  n.tone === 'cleared' && 'bg-cleared', n.tone === 'info' && 'bg-accent')} />
                <div className="min-w-0">
                  <p className="text-micro font-medium">{n.title}</p>
                  <p className="text-[11px] text-muted">{n.body}</p>
                </div>
                <span className="num text-[10px] text-muted ml-auto shrink-0">{n.at}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-3">
          <h4 className="eyebrow mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="size-3" /> Waiting on approval
          </h4>
          <ul className="space-y-2">
            {spec.approvals.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-micro font-medium truncate">{a.title}</p>
                  <p className="text-[11px] text-muted truncate">{a.requester} · {a.meta}</p>
                </div>
                <span className="num text-[10px] text-muted">{a.age}</span>
                <span className="btn-outline h-6 px-2 text-[10px] pointer-events-none">Review</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function PortalsView({ spec }: { spec: SolutionSpec }) {
  const portals = [
    { icon: Users, ...spec.portals.employee },
    { icon: Briefcase, ...spec.portals.management },
  ];
  return (
    <div className="p-4 grid gap-4 lg:grid-cols-2">
      {portals.map((portal) => {
        const Icon = portal.icon;
        return (
          <section key={portal.title} className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="size-3.5 text-accent" strokeWidth={1.75} />
              <h3 className="text-[13px] font-medium">{portal.title}</h3>
            </div>
            <p className="text-[11px] text-muted mb-3">{portal.audience}</p>

            <ul className="space-y-2 mb-4">
              {portal.features.map((f) => (
                <li key={f.label}>
                  <p className="text-micro font-medium">{f.label}</p>
                  <p className="text-[11px] text-muted">{f.detail}</p>
                </li>
              ))}
            </ul>

            {portal.table && (
              <div className="border border-hairline rounded-md overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-raised">
                    <tr>
                      {portal.table.columns.map((c) => (
                        <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {portal.table.rows.map((row, i) => (
                      <tr key={i} className="border-t border-hairline">
                        {row.map((cell, j) => (
                          <td key={j} className={cn('px-2 py-1.5 whitespace-nowrap', j === 0 ? 'font-medium' : 'text-muted')}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AssistantView({ spec }: { spec: SolutionSpec }) {
  const [active, setActive] = useState(0);
  return (
    <div className="p-4">
      <div className="card overflow-hidden max-w-xl mx-auto">
        <header className="flex items-center gap-2 px-4 h-11 border-b border-hairline bg-raised/50">
          <Sparkles className="size-3.5 text-accent" strokeWidth={1.75} />
          <span className="text-[13px] font-medium">{spec.assistant.name}</span>
        </header>

        <div className="p-4 space-y-3">
          <p className="text-micro text-muted">{spec.assistant.intro}</p>

          <div className="space-y-3">
            <div className="flex justify-end">
              <p className="text-micro bg-accent text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[80%]">
                {spec.assistant.examples[active]!.question}
              </p>
            </div>
            <div className="flex justify-start">
              <p className="text-micro bg-raised rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%] leading-relaxed">
                {spec.assistant.examples[active]!.answer}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-hairline">
            {spec.assistant.examples.map((ex, i) => (
              <button key={i} type="button" onClick={() => setActive(i)}
                      className={cn('text-[11px] px-2 h-6 rounded-full border transition-colors text-left truncate max-w-full',
                        i === active ? 'border-accent text-accent bg-accent-soft' : 'border-hairline text-muted hover:bg-raised')}>
                {ex.question}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
