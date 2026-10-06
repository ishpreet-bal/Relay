import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, assertClientAccess, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { CLAIM_TYPES, OBJECTIONS, SIGNAL_TYPES } from '@/lib/domain';
import { STARTER_PLAYBOOKS, type PlaybookTemplate } from './starter-templates';

export { STARTER_PLAYBOOKS };

const strings = (max = 30, len = 300) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);

export const playbookInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  industryFocus: z.string().trim().max(120).nullish(),
  targetAccountTypes: strings(),
  targetTitles: strings(),
  targetDepartments: strings(),
  usefulSignals: z.array(z.enum(SIGNAL_TYPES)).max(10).default([]),
  signalKeywords: strings(),
  approvedClaimTypes: z.array(z.enum(CLAIM_TYPES)).max(18).default([]),
  messagingAngles: z.array(z.object({
    key: z.string().trim().max(40).optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400).default(''),
  })).max(10).default([]),
  sequenceTemplate: z.array(z.object({
    delayDays: z.number().int().min(0).max(90),
    purpose: z.string().trim().min(1).max(60),
    instructions: z.string().trim().min(1).max(2000),
  })).max(8).default([]),
  callOpener: z.string().trim().max(1000).nullish(),
  discoveryQuestions: strings(15),
  objectionHandling: z.array(z.object({
    objection: z.enum(OBJECTIONS),
    response: z.string().trim().min(1).max(1000),
  })).max(15).default([]),
  qualificationCriteria: strings(10),
  autoApproveThreshold: z.number().min(0.5).max(1).default(0.92),
  isActive: z.boolean().default(true),
});
export type PlaybookInput = z.input<typeof playbookInputSchema>;

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'playbook';
}

async function uniqueSlug(organizationId: string, base: string) {
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await db.playbook.count({ where: { organizationId, slug } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function toData(input: z.infer<typeof playbookInputSchema>) {
  return {
    ...input,
    messagingAngles: input.messagingAngles as unknown as Prisma.InputJsonValue,
    sequenceTemplate: input.sequenceTemplate as unknown as Prisma.InputJsonValue,
    objectionHandling: input.objectionHandling as unknown as Prisma.InputJsonValue,
  };
}

/** Workspace templates plus playbooks belonging to clients in scope. */
export async function listPlaybooks(access: AccessContext, clientId?: string | null) {
  const scope = clientFilter(access, clientId);
  return db.playbook.findMany({
    where: {
      organizationId: access.organizationId,
      isActive: true,
      OR: [{ clientId: null }, { clientId: scope.clientId ?? { not: null } }],
    },
    orderBy: [{ isTemplate: 'desc' }, { name: 'asc' }],
    include: { client: { select: { id: true, name: true } }, _count: { select: { campaigns: true } } },
  });
}

export async function findPlaybook(access: AccessContext, id: string) {
  const playbook = await db.playbook.findFirst({ where: { id, organizationId: access.organizationId } });
  if (!playbook) throw new NotFoundError('Playbook');
  if (playbook.clientId) assertClientAccess(access, playbook.clientId);
  return playbook;
}

export async function createPlaybook(access: AccessContext, clientId: string | null, raw: PlaybookInput) {
  if (clientId) assertClientAccess(access, clientId);
  const input = playbookInputSchema.parse(raw);
  return db.playbook.create({
    data: {
      ...toData(input),
      organizationId: access.organizationId,
      clientId,
      isTemplate: !clientId,
      slug: await uniqueSlug(access.organizationId, slugify(input.name)),
    },
  });
}

export async function updatePlaybook(access: AccessContext, id: string, raw: Partial<PlaybookInput>) {
  const existing = await findPlaybook(access, id);
  // Stored JSON columns may be null; the schema expects arrays.
  const base = {
    ...existing,
    messagingAngles: existing.messagingAngles ?? undefined,
    sequenceTemplate: existing.sequenceTemplate ?? undefined,
    objectionHandling: existing.objectionHandling ?? undefined,
  };
  const merged = playbookInputSchema.parse({ ...base, ...raw });
  return db.playbook.update({ where: { id }, data: toData(merged) });
}

/** Copies a template onto a client so it can be tailored without changing the template. */
export async function copyPlaybookToClient(access: AccessContext, id: string, clientId: string) {
  assertClientAccess(access, clientId);
  const source = await findPlaybook(access, id);
  const client = await db.client.findFirst({ where: { id: clientId, organizationId: access.organizationId } });
  if (!client) throw new NotFoundError('Client');
  const {
    id: _id, organizationId: _o, clientId: _c, slug, createdAt: _ca, updatedAt: _ua, isTemplate: _t, sourcePlaybookId: _s, ...rest
  } = source;
  void [_id, _o, _c, _ca, _ua, _t, _s];
  return db.playbook.create({
    data: {
      ...rest,
      messagingAngles: rest.messagingAngles ?? undefined,
      sequenceTemplate: rest.sequenceTemplate ?? undefined,
      objectionHandling: rest.objectionHandling ?? undefined,
      name: `${source.name} — ${client.name}`,
      organizationId: access.organizationId,
      clientId,
      isTemplate: false,
      sourcePlaybookId: source.id,
      slug: await uniqueSlug(access.organizationId, `${slug}-${client.slug}`),
    } as Prisma.PlaybookUncheckedCreateInput,
  });
}

export async function archivePlaybook(access: AccessContext, id: string) {
  await findPlaybook(access, id);
  return db.playbook.update({ where: { id }, data: { isActive: false } });
}

/** Installs any starter templates the workspace does not have yet. */
export async function installStarterPlaybooks(organizationId: string) {
  let installed = 0;
  let skipped = 0;
  for (const t of STARTER_PLAYBOOKS) {
    const exists = await db.playbook.count({ where: { organizationId, slug: t.slug } });
    if (exists) { skipped++; continue; }
    await db.playbook.create({ data: templateData(organizationId, t) });
    installed++;
  }
  return { installed, skipped };
}

export function templateData(organizationId: string, t: PlaybookTemplate): Prisma.PlaybookUncheckedCreateInput {
  return {
    organizationId,
    clientId: null,
    isTemplate: true,
    slug: t.slug,
    name: t.name,
    description: t.description,
    industryFocus: t.industryFocus,
    targetAccountTypes: t.targetAccountTypes,
    targetTitles: t.targetTitles,
    targetDepartments: t.targetDepartments,
    usefulSignals: t.usefulSignals,
    signalKeywords: t.signalKeywords,
    approvedClaimTypes: t.approvedClaimTypes,
    messagingAngles: t.messagingAngles,
    sequenceTemplate: t.sequenceTemplate,
    callOpener: t.callOpener,
    discoveryQuestions: t.discoveryQuestions,
    objectionHandling: t.objectionHandling,
    qualificationCriteria: t.qualificationCriteria,
    autoApproveThreshold: t.autoApproveThreshold,
  };
}
