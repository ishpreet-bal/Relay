'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import type { Chart } from '@/server/services/templates/spec';

const TONE: Record<string, string> = {
  accent: 'rgb(var(--accent))',
  cleared: 'rgb(var(--cleared))',
  held: 'rgb(var(--held))',
  muted: 'rgb(var(--muted))',
};

const axis = {
  stroke: 'rgb(var(--muted))',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  tickLine: false,
  axisLine: false,
};

export function ChartBlock({ chart }: { chart: Chart }) {
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'rgb(var(--raised))' }}
      contentStyle={{
        background: 'rgb(var(--surface))',
        border: '1px solid rgb(var(--hairline))',
        borderRadius: 8,
        fontSize: 12,
        color: 'rgb(var(--ink))',
      }}
    />
  );

  return (
    <div className="card p-4">
      <h4 className="text-[13px] font-medium">{chart.title}</h4>
      {chart.subtitle && <p className="text-[11px] text-muted mb-3">{chart.subtitle}</p>}

      <ResponsiveContainer width="100%" height={180}>
        {chart.type === 'area' ? (
          <AreaChart data={chart.data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              {chart.series.map((s) => (
                <linearGradient key={s.key} id={`g-${chart.id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TONE[s.tone]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={TONE[s.tone]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--hairline))" vertical={false} />
            <XAxis dataKey={chart.xKey} {...axis} />
            <YAxis {...axis} width={44} />
            {tooltip}
            {chart.series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
                    stroke={TONE[s.tone]} strokeWidth={2} fill={`url(#g-${chart.id}-${s.key})`} />
            ))}
          </AreaChart>
        ) : chart.type === 'line' ? (
          <LineChart data={chart.data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--hairline))" vertical={false} />
            <XAxis dataKey={chart.xKey} {...axis} />
            <YAxis {...axis} width={44} />
            {tooltip}
            {chart.series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                    stroke={TONE[s.tone]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={chart.data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--hairline))" vertical={false} />
            <XAxis dataKey={chart.xKey} {...axis} />
            <YAxis {...axis} width={44} />
            {tooltip}
            {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {chart.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={TONE[s.tone]} radius={[3, 3, 0, 0]}
                   stackId={chart.type === 'stackedBar' ? 'a' : undefined} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
