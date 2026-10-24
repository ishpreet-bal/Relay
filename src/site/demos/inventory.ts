import { seeded } from './random';

/**
 * Retail demo: stock levels watched against how fast each item sells and
 * how long its supplier takes, with draft purchase orders grouped by
 * supplier for a person to approve. Fictional shop and products.
 */

export type Sku = {
  sku: string;
  name: string;
  supplier: string;
  stock: number;
  dailySales: number;
  leadDays: number;
  casePack: number;
  unitCostCents: number;
};

export const SKUS: Sku[] = [
  { sku: 'TEA-ORG-100', name: 'Organic green tea, 100 g', supplier: 'Maple Leaf Teas', stock: 46, dailySales: 6, leadDays: 4, casePack: 12, unitCostCents: 640 },
  { sku: 'TEA-CHA-250', name: 'Masala chai, 250 g', supplier: 'Maple Leaf Teas', stock: 70, dailySales: 4, leadDays: 4, casePack: 12, unitCostCents: 910 },
  { sku: 'MUG-STN-12', name: 'Stoneware mug, 12 oz', supplier: 'Kiln & Clay Co.', stock: 18, dailySales: 3, leadDays: 9, casePack: 6, unitCostCents: 780 },
  { sku: 'MUG-TRV-16', name: 'Travel mug, 16 oz', supplier: 'Kiln & Clay Co.', stock: 64, dailySales: 2, leadDays: 9, casePack: 6, unitCostCents: 1250 },
  { sku: 'KTL-GLS-1L', name: 'Glass kettle, 1 L', supplier: 'Northern Housewares', stock: 9, dailySales: 1, leadDays: 12, casePack: 4, unitCostCents: 2900 },
  { sku: 'INF-STL-01', name: 'Steel tea infuser', supplier: 'Northern Housewares', stock: 120, dailySales: 5, leadDays: 12, casePack: 24, unitCostCents: 260 },
  { sku: 'HNY-WLD-500', name: 'Wildflower honey, 500 g', supplier: 'Bayfield Apiaries', stock: 22, dailySales: 3, leadDays: 6, casePack: 12, unitCostCents: 830 },
  { sku: 'GFT-SET-01', name: 'Tea gift set', supplier: 'Maple Leaf Teas', stock: 15, dailySales: 2, leadDays: 4, casePack: 6, unitCostCents: 2150 },
];

export type Order = { sku: string; qty: number; arrivesDay: number };
export type State = { day: number; stock: Record<string, number>; open: Order[]; soldOut: Record<string, number> };

export function initialState(): State {
  return { day: 0, stock: Object.fromEntries(SKUS.map((s) => [s.sku, s.stock])), open: [], soldOut: {} };
}

/** Reorder when stock would not last through the supplier's lead time plus a safety margin. */
export const reorderPoint = (s: Sku, safetyDays: number) => Math.ceil(s.dailySales * (s.leadDays + safetyDays));

export function daysLeft(s: Sku, stock: number) {
  return s.dailySales ? stock / s.dailySales : Infinity;
}

/** One day of trading: sales vary around the average; approved orders arrive on time. */
export function simulateDay(state: State, approved: Order[] = []): State {
  const rand = seeded(1000 + state.day * 97);
  const day = state.day + 1;
  const stock = { ...state.stock };
  const soldOut = { ...state.soldOut };
  const open = [...state.open, ...approved];
  for (const o of open.filter((x) => x.arrivesDay === day)) stock[o.sku] = (stock[o.sku] ?? 0) + o.qty;
  for (const s of SKUS) {
    const demand = Math.round(s.dailySales * (0.6 + rand() * 0.8));
    const sold = Math.min(stock[s.sku] ?? 0, demand);
    stock[s.sku] = (stock[s.sku] ?? 0) - sold;
    if (sold < demand) soldOut[s.sku] = (soldOut[s.sku] ?? 0) + (demand - sold);
  }
  return { day, stock, soldOut, open: open.filter((o) => o.arrivesDay > day) };
}

export type DraftLine = { sku: Sku; qty: number; costCents: number; stock: number; point: number };
export type DraftOrder = { supplier: string; lines: DraftLine[]; totalCents: number; leadDays: number };

/** Draft purchase orders for every item at or below its reorder point with nothing already on order. */
export function draftOrders(state: State, safetyDays: number, coverDays = 14): DraftOrder[] {
  const bySupplier = new Map<string, DraftLine[]>();
  for (const s of SKUS) {
    const stock = state.stock[s.sku] ?? 0;
    const point = reorderPoint(s, safetyDays);
    const onOrder = state.open.some((o) => o.sku === s.sku);
    if (stock > point || onOrder) continue;
    const target = s.dailySales * (s.leadDays + coverDays);
    const qty = Math.max(s.casePack, Math.ceil((target - stock) / s.casePack) * s.casePack);
    const lines = bySupplier.get(s.supplier) ?? [];
    lines.push({ sku: s, qty, costCents: qty * s.unitCostCents, stock, point });
    bySupplier.set(s.supplier, lines);
  }
  return [...bySupplier.entries()].map(([supplier, lines]) => ({
    supplier, lines, totalCents: lines.reduce((t, l) => t + l.costCents, 0), leadDays: Math.max(...lines.map((l) => l.sku.leadDays)),
  })).sort((a, b) => a.supplier.localeCompare(b.supplier));
}

export function approve(state: State, order: DraftOrder): Order[] {
  return order.lines.map((l) => ({ sku: l.sku.sku, qty: l.qty, arrivesDay: state.day + l.sku.leadDays }));
}
