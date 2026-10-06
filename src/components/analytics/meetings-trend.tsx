'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RouterOutputs } from '@/lib/trpc/types';

type Trend = RouterOutputs['analytics']['trend'];

/**
 * Meetings booked per week: one series, one axis, accent fill. The table
 * below the chart carries the same numbers for anyone not reading the bars.
 */
export function MeetingsTrend({ data }: { data: Trend }) {
  const total = data.reduce((n, d) => n + d.meetings, 0);
  return (
    <figure>
      <div className="h-40" role="img" aria-label={`Meetings booked per week; ${total} in the last ${data.length} weeks`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="rgb(var(--hairline))" strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'rgb(var(--muted))' }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'rgb(var(--muted))' }} width={40} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--raised))' }}
              contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--hairline))', borderRadius: 6, fontSize: 12, color: 'rgb(var(--ink))' }}
              formatter={(value: number, name: string) => [value, name === 'meetings' ? 'Meetings booked' : 'Positive replies']}
              labelFormatter={(l: string) => `Week of ${l}`}
            />
            <Bar dataKey="meetings" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="text-[11px] text-muted cursor-pointer">Show as table</summary>
        <table className="mt-1 text-[11px] w-full">
          <thead><tr className="text-muted"><th className="text-left font-normal">Week of</th><th className="text-right font-normal">Meetings</th><th className="text-right font-normal">Positive replies</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num text-right">{d.meetings}</td><td className="num text-right">{d.positiveReplies}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
