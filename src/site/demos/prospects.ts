/**
 * Startup demo: an ideal customer profile applied to a list of businesses,
 * each scored with the reasons behind it, and a first line of outreach
 * prepared for the qualified ones, for a person to review. Fictional
 * companies; nothing is sent.
 */

export type Region = 'GTA' | 'Rest of Ontario' | 'Outside Ontario';
export type Signal = 'Hiring for operations or admin' | 'Job posts mention spreadsheets' | 'Opened a new location' | 'No online booking' | 'Recently raised funding';

export const SIGNALS: Signal[] = ['Hiring for operations or admin', 'Job posts mention spreadsheets', 'Opened a new location', 'No online booking', 'Recently raised funding'];
export const INDUSTRIES = ['Manufacturing', 'Logistics', 'Construction', 'Professional services', 'Clinics', 'Retail'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export type Prospect = { name: string; industry: Industry; city: string; region: Region; employees: number; signals: Signal[] };

export const PROSPECTS: Prospect[] = [
  { name: 'Halcrest Metal Works', industry: 'Manufacturing', city: 'Brampton', region: 'GTA', employees: 85, signals: ['Hiring for operations or admin', 'Job posts mention spreadsheets'] },
  { name: 'Ridgeway Freight', industry: 'Logistics', city: 'Mississauga', region: 'GTA', employees: 140, signals: ['Opened a new location'] },
  { name: 'Brookline Dental Group', industry: 'Clinics', city: 'Markham', region: 'GTA', employees: 22, signals: ['No online booking'] },
  { name: 'Ostrander Builders', industry: 'Construction', city: 'Barrie', region: 'Rest of Ontario', employees: 35, signals: ['Job posts mention spreadsheets'] },
  { name: 'Kettle & Pine Goods', industry: 'Retail', city: 'Toronto', region: 'GTA', employees: 12, signals: ['No online booking'] },
  { name: 'Larkspur Advisory', industry: 'Professional services', city: 'Toronto', region: 'GTA', employees: 18, signals: ['Recently raised funding', 'Hiring for operations or admin'] },
  { name: 'Fenwick Plastics', industry: 'Manufacturing', city: 'Kitchener', region: 'Rest of Ontario', employees: 210, signals: ['Opened a new location', 'Hiring for operations or admin'] },
  { name: 'Northgate Couriers', industry: 'Logistics', city: 'Hamilton', region: 'Rest of Ontario', employees: 60, signals: ['Job posts mention spreadsheets'] },
  { name: 'Tidewater Imports', industry: 'Retail', city: 'Halifax', region: 'Outside Ontario', employees: 45, signals: ['Opened a new location'] },
  { name: 'Cobalt Ridge Engineering', industry: 'Professional services', city: 'Ottawa', region: 'Rest of Ontario', employees: 55, signals: [] },
  { name: 'Marlowe Precision', industry: 'Manufacturing', city: 'Vaughan', region: 'GTA', employees: 40, signals: ['Job posts mention spreadsheets'] },
  { name: 'Summit Physiotherapy', industry: 'Clinics', city: 'Oakville', region: 'GTA', employees: 14, signals: ['No online booking', 'Opened a new location'] },
  { name: 'Gravelline Contracting', industry: 'Construction', city: 'Pickering', region: 'GTA', employees: 28, signals: ['Hiring for operations or admin'] },
  { name: 'Westbrook Supply Co.', industry: 'Logistics', city: 'Winnipeg', region: 'Outside Ontario', employees: 95, signals: ['Hiring for operations or admin'] },
];

export type Profile = {
  industries: Industry[];
  regions: Region[];
  minEmployees: number;
  maxEmployees: number;
  signals: Signal[];
  threshold: number;
};

export const DEFAULT_PROFILE: Profile = {
  industries: ['Manufacturing', 'Logistics'],
  regions: ['GTA', 'Rest of Ontario'],
  minEmployees: 20,
  maxEmployees: 250,
  signals: ['Hiring for operations or admin', 'Job posts mention spreadsheets', 'Opened a new location'],
  threshold: 70,
};

export type Reason = { label: string; points: number; max: number; met: boolean };
export type Scored = Prospect & { score: number; reasons: Reason[]; qualified: boolean; opener: string | null };

export function score(p: Prospect, profile: Profile): Scored {
  const industry = profile.industries.includes(p.industry);
  const region = profile.regions.includes(p.region);
  const size = p.employees >= profile.minEmployees && p.employees <= profile.maxEmployees;
  const matched = p.signals.filter((s) => profile.signals.includes(s));
  const signalPoints = Math.min(30, matched.length * 15);
  const reasons: Reason[] = [
    { label: industry ? `${p.industry} is a target industry` : `${p.industry} is not a target industry`, points: industry ? 30 : 0, max: 30, met: industry },
    { label: region ? `Located in ${p.city} (${p.region})` : `${p.city} is outside the target area`, points: region ? 20 : 0, max: 20, met: region },
    { label: size ? `${p.employees} employees, within ${profile.minEmployees}–${profile.maxEmployees}` : `${p.employees} employees, outside ${profile.minEmployees}–${profile.maxEmployees}`, points: size ? 20 : 0, max: 20, met: size },
    { label: matched.length ? `Signals: ${matched.join('; ')}` : 'No matching buying signals', points: signalPoints, max: 30, met: matched.length > 0 },
  ];
  const total = reasons.reduce((s, r) => s + r.points, 0);
  const qualified = total >= profile.threshold;
  return { ...p, score: total, reasons, qualified, opener: qualified ? opener(p, matched) : null };
}

function opener(p: Prospect, matched: Signal[]): string {
  const s = matched[0];
  if (s === 'Hiring for operations or admin') return `Saw that ${p.name} is hiring on the operations side. Teams at that stage often find a lot of the admin can be taken off people's plates.`;
  if (s === 'Job posts mention spreadsheets') return `Noticed ${p.name}'s job posts mention a lot of spreadsheet work. That is usually where we find the quickest wins.`;
  if (s === 'Opened a new location') return `Congratulations on the new ${p.city} location. A second site is often when reporting across locations starts to take real time.`;
  if (s === 'No online booking') return `${p.name} books by phone today. Online booking with reminders can usually be added without changing how your team works.`;
  if (s === 'Recently raised funding') return `Congratulations on the raise. If growing the team means growing the admin, that's the part we automate.`;
  return `${p.name} looks like a strong fit for what we do in ${p.industry.toLowerCase()}.`;
}

export function rank(profile: Profile) {
  const scored = PROSPECTS.map((p) => score(p, profile)).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { scored, qualified: scored.filter((s) => s.qualified).length };
}
