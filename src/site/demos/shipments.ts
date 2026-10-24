/**
 * Logistics demo: one working day of scan events for eight shipments.
 * Each shipment's status is worked out from its events and its promised
 * delivery time, and a customer update is written only when the status
 * changes. Fictional carriers, customers and places.
 */

export type ShipmentEvent = { at: number; kind: 'departed' | 'scan' | 'delay' | 'delivered'; place: string; delayMin?: number; note?: string };
export type Shipment = {
  id: string;
  customer: string;
  from: string;
  to: string;
  plannedEta: number; // minutes after midnight
  promisedBy: number;
  events: ShipmentEvent[];
};
export type Status = 'Scheduled' | 'In transit' | 'At risk' | 'Delayed' | 'Delivered';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export const DAY_START = h(6);
export const DAY_END = h(18);

export const SHIPMENTS: Shipment[] = [
  { id: 'SH-1041', customer: 'Northfield Hardware', from: 'Brampton DC', to: 'Barrie', plannedEta: h(11, 30), promisedBy: h(12), events: [
    { at: h(7), kind: 'departed', place: 'Brampton DC' }, { at: h(9, 10), kind: 'scan', place: 'Hwy 400 checkpoint' }, { at: h(11, 20), kind: 'delivered', place: 'Barrie', note: 'Signed by M. Osei' }] },
  { id: 'SH-1042', customer: 'Lakeside Kitchens', from: 'Mississauga yard', to: 'Hamilton', plannedEta: h(13), promisedBy: h(14), events: [
    { at: h(8), kind: 'departed', place: 'Mississauga yard' }, { at: h(10), kind: 'delay', place: 'QEW near Burlington', delayMin: 45, note: 'Collision on the QEW' },
    { at: h(12), kind: 'delay', place: 'Burlington', delayMin: 30, note: 'Still slow through Burlington' }, { at: h(14, 20), kind: 'delivered', place: 'Hamilton', note: 'Signed by J. Lam' }] },
  { id: 'SH-1043', customer: 'Greenway Grocers', from: 'Vaughan cold store', to: 'Kitchener', plannedEta: h(12, 15), promisedBy: h(13), events: [
    { at: h(9), kind: 'departed', place: 'Vaughan cold store' }, { at: h(10, 30), kind: 'scan', place: 'Hwy 401 / 407' }, { at: h(12, 5), kind: 'delivered', place: 'Kitchener', note: 'Temperature log attached' }] },
  { id: 'SH-1044', customer: 'Apex Fabrication', from: 'Brampton DC', to: 'London', plannedEta: h(15), promisedBy: h(16), events: [
    { at: h(9, 30), kind: 'departed', place: 'Brampton DC' }, { at: h(12, 40), kind: 'delay', place: 'Woodstock', delayMin: 50, note: 'Driver rest stop extended' },
    { at: h(15, 50), kind: 'delivered', place: 'London', note: 'Signed by S. Ahmed' }] },
  { id: 'SH-1045', customer: 'Bluewater Marine', from: 'Mississauga yard', to: 'Owen Sound', plannedEta: h(16, 30), promisedBy: h(17), events: [
    { at: h(11), kind: 'departed', place: 'Mississauga yard' }, { at: h(14), kind: 'scan', place: 'Orangeville' }, { at: h(15, 10), kind: 'delay', place: 'Hwy 10', delayMin: 70, note: 'Road closure, detour' }] },
  { id: 'SH-1046', customer: 'Cedar & Co. Furniture', from: 'Vaughan cold store', to: 'Markham', plannedEta: h(10), promisedBy: h(11), events: [
    { at: h(8, 30), kind: 'departed', place: 'Vaughan cold store' }, { at: h(9, 45), kind: 'delivered', place: 'Markham', note: 'Left at loading dock' }] },
  { id: 'SH-1047', customer: 'Harbourline Pharmacy Supply', from: 'Brampton DC', to: 'Oshawa', plannedEta: h(14), promisedBy: h(15), events: [
    { at: h(11, 30), kind: 'departed', place: 'Brampton DC' }, { at: h(13), kind: 'scan', place: 'Hwy 407 East' }, { at: h(13, 55), kind: 'delivered', place: 'Oshawa', note: 'Signed by D. Chen' }] },
  { id: 'SH-1048', customer: 'Summit Auto Parts', from: 'Mississauga yard', to: 'Peterborough', plannedEta: h(17), promisedBy: h(17, 30), events: [
    { at: h(13), kind: 'departed', place: 'Mississauga yard' }, { at: h(15, 30), kind: 'scan', place: 'Hwy 115' }] },
];

export type ShipmentState = { status: Status; eta: number; lastEvent: ShipmentEvent | null };

export function stateAt(s: Shipment, minute: number): ShipmentState {
  const seen = s.events.filter((e) => e.at <= minute);
  const last = seen[seen.length - 1] ?? null;
  const delivered = seen.find((e) => e.kind === 'delivered');
  if (delivered) return { status: 'Delivered', eta: delivered.at, lastEvent: delivered };
  if (!seen.some((e) => e.kind === 'departed')) return { status: 'Scheduled', eta: s.plannedEta, lastEvent: null };
  const eta = s.plannedEta + seen.reduce((sum, e) => sum + (e.delayMin ?? 0), 0);
  const status: Status = eta > s.promisedBy ? 'Delayed' : eta > s.promisedBy - 30 ? 'At risk' : 'In transit';
  return { status, eta, lastEvent: last };
}

export const clock = (minute: number) => {
  const hh = Math.floor(minute / 60);
  const mm = minute % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};

export type CustomerUpdate = { shipment: string; customer: string; at: number; status: Status; message: string };

function messageFor(s: Shipment, st: ShipmentState): string {
  switch (st.status) {
    case 'In transit': return `Your shipment ${s.id} to ${s.to} is on its way and expected by ${clock(st.eta)}.`;
    case 'At risk': return `Your shipment ${s.id} is running a little behind (${st.lastEvent?.note ?? 'traffic'}). We now expect it by ${clock(st.eta)}, still within your window.`;
    case 'Delayed': return `Your shipment ${s.id} is delayed: ${st.lastEvent?.note ?? 'a hold-up on the route'}. New estimated arrival ${clock(st.eta)}. We will update you if that changes.`;
    case 'Delivered': return `Your shipment ${s.id} was delivered in ${s.to} at ${clock(st.eta)}. ${st.lastEvent?.note ?? ''}`.trim();
    default: return '';
  }
}

/**
 * Updates written as the clock moves from one minute to another: one per
 * status change, so customers hear about what matters and nothing else.
 */
export function updatesBetween(from: number, to: number): CustomerUpdate[] {
  const out: CustomerUpdate[] = [];
  for (const s of SHIPMENTS) {
    const times = s.events.map((e) => e.at).filter((t) => t > from && t <= to);
    let prev = stateAt(s, from).status;
    for (const t of times) {
      const st = stateAt(s, t);
      if (st.status !== prev && st.status !== 'Scheduled') {
        out.push({ shipment: s.id, customer: s.customer, at: t, status: st.status, message: messageFor(s, st) });
      }
      prev = st.status;
    }
  }
  return out.sort((a, b) => a.at - b.at || a.shipment.localeCompare(b.shipment));
}

export function dispatchSummary(minute: number) {
  const counts: Record<Status, number> = { Scheduled: 0, 'In transit': 0, 'At risk': 0, Delayed: 0, Delivered: 0 };
  for (const s of SHIPMENTS) counts[stateAt(s, minute).status]++;
  const events = SHIPMENTS.reduce((n, s) => n + s.events.filter((e) => e.at <= minute).length, 0);
  return { counts, events, updates: updatesBetween(DAY_START - 1, minute).length };
}
