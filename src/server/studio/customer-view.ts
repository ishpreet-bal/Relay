import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import type { Manifest } from './manifest';

/**
 * What a customer's own users see of their application: its branding and
 * terminology, dashboard figures, records, the forms that start workflows,
 * approvals waiting on them and recent runs. Production data only, from the
 * deployed configuration; no configuration history, connections or costs.
 */

export async function customerApps(access: AccessContext, clientId: string) {
  return db.clientApplication.findMany({
    where: { ...clientFilter(access, clientId), archivedAt: null, activeConfigVersionId: { not: null } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, status: true, updatedAt: true },
  });
}

export async function customerApp(access: AccessContext, id: string) {
  const app = await db.clientApplication.findFirst({ where: { id, ...clientFilter(access), archivedAt: null } });
  if (!app?.activeConfigVersionId) throw new NotFoundError('Application');
  const config = await db.appConfigVersion.findUniqueOrThrow({ where: { id: app.activeConfigVersionId } });
  const m = config.manifest as unknown as Manifest;
  const label = (key: string, fallback: string) => m.terminology[key] ?? fallback;
  const scope = { applicationId: app.id, clientId: app.clientId, isTest: false };

  const widgets = await Promise.all(m.dashboard.widgets.map(async (w) => {
    if (w.type === 'count') return { ...w, value: await db.appRecord.count({ where: { ...scope, collection: w.collection } }) };
    if (w.type === 'sum' && w.field) {
      const rows = await db.$queryRaw<Array<{ total: number | null }>>`
        SELECT sum((data->>${w.field})::numeric)::float AS total FROM "AppRecord"
        WHERE "applicationId" = ${app.id}::uuid AND "clientId" = ${app.clientId}::uuid AND "isTest" = false AND collection = ${w.collection}
          AND (data->>${w.field}) ~ ${'^-?[0-9]+(\\.[0-9]+)?$'}`;
      return { ...w, value: Math.round((rows[0]?.total ?? 0) * 100) / 100 };
    }
    const items = await db.appRecord.findMany({ where: { ...scope, collection: w.collection }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, data: true, createdAt: true } });
    return { ...w, items };
  }));

  // Workflows a person starts with a form: manual or webhook, taking a collection's fields as input.
  const forms = m.workflows
    .filter((wf) => wf.trigger.type === 'manual' || wf.trigger.type === 'webhook')
    .map((wf) => {
      const collection = wf.steps.map((s) => (s.config as { collection?: string }).collection).find(Boolean);
      const coll = m.collections.find((c) => c.key === collection);
      return coll ? { workflowKey: wf.key, name: wf.name, collection: coll.key, fields: coll.fields } : null;
    })
    .filter(Boolean);

  const [waiting, runs] = await Promise.all([
    db.workflowExecution.findMany({ where: { applicationId: app.id, isTest: false, status: 'WAITING_APPROVAL' }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, workflowKey: true, createdAt: true, input: true } }),
    db.workflowExecution.findMany({ where: { applicationId: app.id, isTest: false }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, workflowKey: true, status: true, trigger: true, createdAt: true, finishedAt: true, error: true } }),
  ]);
  const approvals = await db.appRecord.findMany({ where: { ...scope, collection: '_approvals', createdByExecutionId: { in: waiting.map((w) => w.id) } }, select: { createdByExecutionId: true, data: true } });
  const wfName = (key: string) => m.workflows.find((w) => w.key === key)?.name ?? key;

  return {
    app: { id: app.id, name: app.name, status: app.status },
    branding: m.branding,
    collections: m.collections.map((c) => ({ key: c.key, label: label(c.key, c.label), fields: c.fields })),
    widgets,
    forms: forms as Array<{ workflowKey: string; name: string; collection: string; fields: Manifest['collections'][number]['fields'] }>,
    approvals: waiting.map((w) => {
      const a = approvals.find((x) => x.createdByExecutionId === w.id)?.data as { title?: string; approverRole?: string } | undefined;
      return { executionId: w.id, workflow: wfName(w.workflowKey), title: a?.title ?? 'Waiting for a decision', approverRole: a?.approverRole ?? null, createdAt: w.createdAt };
    }),
    runs: runs.map((r) => ({ ...r, workflow: wfName(r.workflowKey), error: r.error?.slice(0, 200) ?? null })),
  };
}

export type CustomerApp = Prisma.PromiseReturnType<typeof customerApp>;
