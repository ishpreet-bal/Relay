import type { Workflow } from '@/server/services/templates/spec';

const NODE_W = 132;
const NODE_H = 54;
const GAP_X = 56;
const GAP_Y = 26;

const KIND_STYLE: Record<string, { fill: string; stroke: string; text: string; label: string }> = {
  trigger:  { fill: 'rgb(var(--accent) / 0.10)',  stroke: 'rgb(var(--accent))',   text: 'rgb(var(--accent))',  label: 'Trigger' },
  action:   { fill: 'rgb(var(--surface))',        stroke: 'rgb(var(--hairline))', text: 'rgb(var(--ink))',     label: 'Automated' },
  decision: { fill: 'rgb(var(--held) / 0.10)',    stroke: 'rgb(var(--held))',     text: 'rgb(var(--held))',    label: 'Decision' },
  human:    { fill: 'rgb(var(--held) / 0.06)',    stroke: 'rgb(var(--held))',     text: 'rgb(var(--ink))',     label: 'Person' },
  output:   { fill: 'rgb(var(--cleared) / 0.10)', stroke: 'rgb(var(--cleared))',  text: 'rgb(var(--cleared))', label: 'Output' },
};

/**
 * Renders a workflow from grid coordinates rather than absolute pixels. The
 * spec says "column 2, row 1"; the renderer owns spacing, so every diagram in
 * the library lines up identically and a spec author can't produce a crooked
 * one. Human steps are deliberately styled distinctly — prospects care a great
 * deal about which parts still need a person.
 */
export function WorkflowDiagram({ workflow }: { workflow: Workflow }) {
  const cols = Math.max(...workflow.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...workflow.nodes.map((n) => n.row)) + 1;
  const width = cols * NODE_W + (cols - 1) * GAP_X;
  const height = rows * NODE_H + (rows - 1) * GAP_Y;

  const pos = (col: number, row: number) => ({
    x: col * (NODE_W + GAP_X),
    y: row * (NODE_H + GAP_Y),
  });
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));

  return (
    <figure className="overflow-x-auto">
      <svg viewBox={`-8 -8 ${width + 16} ${height + 28}`} className="w-full min-w-[620px]" role="img"
           aria-label={`Workflow diagram: ${workflow.title}`}>
        <defs>
          <marker id="wf-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="rgb(var(--muted))" />
          </marker>
        </defs>

        {workflow.edges.map((edge, i) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const a = pos(from.col, from.row);
          const b = pos(to.col, to.row);
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const mid = x1 + (x2 - x1) / 2;
          // Orthogonal routing reads as a process diagram; curves read as decoration.
          const path = y1 === y2
            ? `M${x1},${y1} L${x2 - 6},${y2}`
            : `M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2 - 6},${y2}`;
          return (
            <g key={i}>
              <path d={path} fill="none" stroke="rgb(var(--hairline))" strokeWidth="1.5" markerEnd="url(#wf-arrow)" />
              {edge.label && (
                <text x={mid} y={(y1 + y2) / 2 - 5} textAnchor="middle"
                      fontSize="9" fill="rgb(var(--muted))" fontFamily="var(--font-mono)">
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {workflow.nodes.map((node) => {
          const { x, y } = pos(node.col, node.row);
          const style = KIND_STYLE[node.kind]!;
          return (
            <g key={node.id}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="7"
                    fill={style.fill} stroke={style.stroke} strokeWidth="1.25"
                    strokeDasharray={node.kind === 'human' ? '4 3' : undefined} />
              <text x={x + 10} y={y + 20} fontSize="11" fontWeight="500" fill={style.text}>
                {truncate(node.label, 20)}
              </text>
              {node.detail && (
                <text x={x + 10} y={y + 35} fontSize="9" fill="rgb(var(--muted))">
                  {truncate(node.detail, 24)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {Object.entries(KIND_STYLE).map(([kind, style]) => (
          <span key={kind} className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="size-2 rounded-sm" style={{ background: style.fill, border: `1px solid ${style.stroke}` }} />
            {style.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
