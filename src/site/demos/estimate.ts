import { round } from './random';

/**
 * Construction demo: a customer's inquiry, in their own words, read for the
 * details an estimator needs and turned into a draft estimate and a task
 * list. The rates are sample figures; a real system uses the contractor's
 * own rate sheet, and a person reviews every estimate before it is sent.
 */

export type ProjectType = 'kitchen' | 'bathroom' | 'basement' | 'deck' | 'flooring' | 'roofing' | 'commercial';

export const SAMPLE_INQUIRIES = [
  {
    label: 'Kitchen renovation',
    text: 'Hi, we want to redo our kitchen in Mississauga. It is about 180 sq ft. We would like quartz countertops and new cabinets, and we are hoping to start in March. We might remove the wall between the kitchen and dining room.',
  },
  {
    label: 'Backyard deck',
    text: 'Looking for a quote on a new composite deck, roughly 16 x 20 feet, at our place in Oakville. Ideally finished before summer.',
  },
  {
    label: 'Office fit-out',
    text: 'We are a small firm moving into a 2,400 square foot unit in Vaughan and need an office fit-out: a few meeting rooms, open desks and a kitchenette. Move-in is planned for September.',
  },
];

type Parsed = {
  type: ProjectType | null;
  areaSqFt: number | null;
  areaSource: string | null;
  material: string | null;
  timeline: string | null;
  location: string | null;
  structural: boolean;
};

const TYPES: [ProjectType, RegExp][] = [
  ['commercial', /\b(office|commercial|fit[- ]?out|tenant|retail unit|storefront)\b/i],
  ['kitchen', /\bkitchen\b/i],
  ['bathroom', /\b(bath(room)?|washroom|ensuite|shower)\b/i],
  ['basement', /\bbasement\b/i],
  ['deck', /\b(deck|patio)\b/i],
  ['roofing', /\b(roof|roofing|shingles?)\b/i],
  ['flooring', /\b(floor|flooring|hardwood|laminate floor|vinyl plank)\b/i],
];

const MATERIALS: [string, RegExp][] = [
  ['quartz', /\bquartz\b/i], ['granite', /\bgranite\b/i], ['laminate', /\blaminate\b/i],
  ['porcelain tile', /\b(porcelain|ceramic)?\s*tiles?\b/i], ['hardwood', /\bhardwood\b/i], ['vinyl plank', /\b(vinyl|lvp)\b/i],
  ['composite', /\bcomposite\b/i], ['cedar', /\bcedar\b/i], ['pressure-treated', /\bpressure[- ]treated\b/i],
  ['metal', /\bmetal roof/i], ['asphalt shingles', /\bshingles?\b/i],
];

const CITIES = ['Toronto', 'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Richmond Hill', 'Oakville', 'Burlington', 'Milton', 'Pickering', 'Ajax', 'Whitby', 'Oshawa', 'Hamilton', 'Ottawa', 'Kitchener', 'Waterloo', 'London', 'Guelph', 'Barrie'];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseInquiry(text: string): Parsed {
  const type = TYPES.find(([, re]) => re.test(text))?.[0] ?? null;

  let areaSqFt: number | null = null;
  let areaSource: string | null = null;
  const area = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|square\s*f(?:ee|oo)t|ft2|ft²|m2|m²|square\s*met(?:er|re)s?)/i);
  if (area) {
    const n = Number(area[1]!.replace(/,/g, ''));
    const metric = /m2|m²|met/i.test(area[2]!);
    areaSqFt = Math.round(metric ? n * 10.7639 : n);
    areaSource = area[0];
  } else {
    const dims = text.match(/(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/i);
    if (dims) {
      areaSqFt = Math.round(Number(dims[1]) * Number(dims[2]));
      areaSource = dims[0].trim();
    }
  }

  const material = MATERIALS.find(([, re]) => re.test(text))?.[0] ?? null;

  const lower = text.toLowerCase();
  const month = MONTHS.find((m) => new RegExp(`\\b${m}\\b`).test(lower));
  const season = lower.match(/\b(before|by|in|this|next)?\s*(spring|summer|fall|autumn|winter)\b/);
  const timeline = month ? month[0]!.toUpperCase() + month.slice(1)
    : season ? season[0]!.trim().replace(/^\w/, (c) => c.toUpperCase())
    : /\b(asap|as soon as possible|urgent)\b/.test(lower) ? 'As soon as possible'
    : null;

  const location = CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(text)) ?? null;
  const structural = /\b(remove|knock (down|out)|take out|open up)\b[^.]*\bwall\b|\bload[- ]bearing\b|\bmove (the )?plumbing\b|\bnew window\b|\bpermit\b/i.test(text);

  return { type, areaSqFt, areaSource, material, timeline, location, structural };
}

export type LineItem = { label: string; basis: string; cents: number };

const D = (dollars: number) => Math.round(dollars * 100);

/** Sample rates for the demo, in Canadian dollars. Every contractor's are different. */
function lineItems(type: ProjectType, area: number, material: string | null): LineItem[] {
  const per = (label: string, rate: number) => ({ label, basis: `${area.toLocaleString('en-CA')} sq ft × $${rate}`, cents: D(area * rate) });
  const fixed = (label: string, dollars: number, basis = 'allowance') => ({ label, basis, cents: D(dollars) });
  switch (type) {
    case 'kitchen': {
      const counter = material === 'quartz' ? 9500 : material === 'granite' ? 8200 : material === 'laminate' ? 3200 : 6000;
      return [per('Demolition and disposal', 6), per('Cabinetry, supply and install', 140),
        fixed(`Countertops${material ? ` (${material})` : ''}`, counter, material ? 'supplier estimate' : 'allowance, material not chosen'),
        fixed('Plumbing and electrical', 4200), per('Finishing and paint', 9)];
    }
    case 'bathroom':
      return [per('Demolition and disposal', 9), per('Waterproofing and tile', material?.includes('tile') ? 38 : 30), fixed('Fixtures', 4500), fixed('Plumbing', 3800), fixed('Vanity and finishing', 2600)];
    case 'basement':
      return [per('Framing and insulation', 18), per('Drywall and paint', 14), per(`Flooring${material ? ` (${material})` : ''}`, material === 'hardwood' ? 11 : 7), per('Electrical and lighting', 5), fixed('Permit and inspections', 900)];
    case 'deck': {
      const rate = material === 'composite' ? 62 : material === 'cedar' ? 48 : 36;
      const railingFt = Math.round(Math.sqrt(area) * 3);
      return [per('Footings and framing', 18), per(`Decking (${material ?? 'pressure-treated'})`, rate),
        { label: 'Railings', basis: `${railingFt} linear ft × $85`, cents: D(railingFt * 85) }, fixed('Stairs and finishing', 1200)];
    }
    case 'flooring':
      return [per('Removal of existing floor', 2), per(`Flooring (${material ?? 'vinyl plank'})`, material === 'hardwood' ? 9 : material === 'porcelain tile' ? 12 : 5), per('Installation', 4.5)];
    case 'roofing':
      return [per('Tear-off and disposal', 1.6), per(`Roofing (${material ?? 'asphalt shingles'})`, material === 'metal' ? 11 : 4.2), fixed('Flashing, vents and eavestrough', 1400)];
    case 'commercial': {
      const base = [per('Partitions and doors', 35), per('Electrical and data', 12), per('Finishes and flooring', 20), fixed('Kitchenette', 14000, 'allowance')];
      const subtotal = base.reduce((s, l) => s + l.cents, 0);
      return [...base, { label: 'Project management', basis: '10% of work', cents: Math.round(subtotal * 0.1) }];
    }
  }
}

/** A follow-up task, due a number of business days from when the inquiry arrives. */
export type Task = { title: string; inBusinessDays: number };
export type Estimate = {
  parsed: Parsed;
  items: LineItem[];
  subtotal: number;
  contingency: number;
  tax: number;
  total: number;
  range: [number, number];
  questions: string[];
  tasks: Task[];
};

export const dueLabel = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Next business day' : `In ${days} business days`);

export function draftEstimate(text: string): Estimate {
  const parsed = parseInquiry(text);
  const questions: string[] = [];
  if (!parsed.type) questions.push('What kind of project is it? (kitchen, bathroom, basement, deck, flooring, roofing, commercial)');
  if (!parsed.areaSqFt) questions.push('Roughly how large is the space? (square feet or dimensions)');
  if (!parsed.material && parsed.type && parsed.type !== 'commercial') questions.push('Do you have a material or finish in mind?');
  if (!parsed.timeline) questions.push('When would you like the work to start?');
  if (!parsed.location) questions.push('Where is the property?');

  const items = parsed.type && parsed.areaSqFt ? lineItems(parsed.type, parsed.areaSqFt, parsed.material) : [];
  const subtotal = items.reduce((s, l) => s + l.cents, 0);
  const contingency = Math.round(subtotal * 0.1);
  const tax = Math.round((subtotal + contingency) * 0.13); // Ontario HST
  const total = subtotal + contingency + tax;

  const tasks: Task[] = [
    { title: questions.length ? 'Call the customer to fill in the missing details' : 'Call the customer to confirm the scope', inBusinessDays: 0 },
    { title: `Site visit and measurements${parsed.location ? ` in ${parsed.location}` : ''}`, inBusinessDays: 2 },
  ];
  if (parsed.material) tasks.push({ title: `Request supplier quotes for ${parsed.material}`, inBusinessDays: 3 });
  if (parsed.structural) tasks.push({ title: 'Check structure and permit requirements', inBusinessDays: 3 });
  tasks.push({ title: 'Review and send the final quote', inBusinessDays: 5 });
  if (parsed.timeline) tasks.push({ title: `Pencil in a crew for ${parsed.timeline}`, inBusinessDays: 6 });

  return {
    parsed, items, subtotal, contingency, tax, total,
    range: [Math.round(total * 0.9 / 10000) * 10000, Math.round(total * 1.15 / 10000) * 10000],
    questions, tasks,
  };
}

export const roundDollars = (cents: number) => round(cents / 100);
