import { z } from 'zod';

/**
 * The demo spec.
 *
 * Every industry demo in the library is this one JSON shape rendered by one set
 * of components. Thirteen hand-built portals would take weeks, drift apart
 * visually, and rot the moment the design system changed. A spec means adding
 * an industry is a seed row, and improving the renderer improves all thirteen
 * at once.
 *
 * The constraint this imposes is real and worth stating: anything a demo needs
 * must be expressible here. That has kept the demos honest — they show
 * dashboards, workflows, and portals, not bespoke one-off screens.
 */

export const kpiSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  delta: z.number().optional(),
  /** How to read a positive delta — some metrics are better going down. */
  goodDirection: z.enum(['up', 'down']).default('up'),
  caption: z.string().optional(),
});

export const chartSchema = z.object({
  id: z.string(),
  type: z.enum(['line', 'area', 'bar', 'stackedBar', 'donut']),
  title: z.string(),
  subtitle: z.string().optional(),
  xKey: z.string(),
  series: z.array(z.object({ key: z.string(), label: z.string(), tone: z.enum(['accent', 'cleared', 'held', 'muted']).default('accent') })),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
});

export const workflowSchema = z.object({
  title: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    detail: z.string().optional(),
    kind: z.enum(['trigger', 'action', 'decision', 'output', 'human']),
    /** Grid coordinates, not pixels — the renderer owns the spacing. */
    col: z.number().int().min(0).max(5),
    row: z.number().int().min(0).max(4),
  })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
});

export const portalSchema = z.object({
  title: z.string(),
  audience: z.string(),
  features: z.array(z.object({ label: z.string(), detail: z.string() })),
  /** Rows shown in the portal's sample table. */
  table: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }).optional(),
});

export const solutionSpecSchema = z.object({
  problem: z.string(),
  outcome: z.string(),
  kpis: z.array(kpiSchema).min(3).max(6),
  charts: z.array(chartSchema).min(1).max(4),
  workflows: z.array(workflowSchema).min(1).max(3),
  portals: z.object({ employee: portalSchema, management: portalSchema }),
  approvals: z.array(z.object({ title: z.string(), requester: z.string(), meta: z.string(), age: z.string() })).default([]),
  notifications: z.array(z.object({ title: z.string(), body: z.string(), tone: z.enum(['info', 'cleared', 'held', 'blocked']).default('info'), at: z.string() })).default([]),
  assistant: z.object({
    name: z.string(),
    intro: z.string(),
    examples: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
  integrations: z.array(z.string()).default([]),
  buildEstimate: z.object({ weeks: z.string(), phases: z.array(z.string()) }),
});

export type SolutionSpec = z.infer<typeof solutionSpecSchema>;
export type Kpi = z.infer<typeof kpiSchema>;
export type Chart = z.infer<typeof chartSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type Portal = z.infer<typeof portalSchema>;
