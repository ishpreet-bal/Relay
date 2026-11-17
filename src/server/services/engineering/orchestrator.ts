import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { raiseAlert, resolveAlert } from '@/server/services/alerts';
import { advance } from './projects';

/**
 * The orchestrator's clock, run by scheduled maintenance. For each active
 * project it: stops work over budget, escalates tasks that failed too often,
 * releases tasks whose dependencies are done, and moves the project on when
 * its gate is met (as many stages as are already satisfied). It never marks
 * work done and never runs anything that needs approval.
 */
export async function orchestrateProjects(now = new Date()) {
  const projects = await db.engineeringProject.findMany({ where: { status: 'ACTIVE' }, select: { id: true, organizationId: true, name: true, budgetCents: true } });
  const summary = { projects: projects.length, advanced: 0, released: 0, blocked: 0 };
  for (const p of projects) {
    try {
      const spent = (await db.agentRun.aggregate({ where: { projectId: p.id }, _sum: { costMillicents: true } }))._sum.costMillicents ?? 0;
      if (spent >= p.budgetCents * 1000) {
        await block(p, `Budget reached: ${(spent / 100_000).toFixed(2)} of ${(p.budgetCents / 100).toFixed(2)} spent. Raise the budget to continue.`, 'budget');
        summary.blocked++;
        continue;
      }
      const exhausted = await db.engineeringTask.findFirst({ where: { projectId: p.id, status: 'FAILED', attempts: { gte: db.engineeringTask.fields.maxAttempts } }, select: { title: true, error: true } });
      if (exhausted) {
        await block(p, `Task "${exhausted.title}" failed after its retries: ${exhausted.error ?? 'no detail'}`, 'task');
        summary.blocked++;
        continue;
      }
      summary.released += await releaseReadyTasks(p.id);
      // Several gates may already be satisfied (documents accepted in a batch).
      for (let i = 0; i < 15; i++) {
        const r = await advance(p.id, 'orchestrator');
        if (!r.moved) break;
        summary.advanced++;
      }
    } catch (err) {
      logger.error('engineering.orchestrate_failed', { projectId: p.id, error: err });
    }
  }
  void now;
  return summary;
}

/** PENDING tasks whose dependencies are all DONE become READY. */
export async function releaseReadyTasks(projectId: string) {
  const pending = await db.engineeringTask.findMany({ where: { projectId, status: 'PENDING' }, select: { id: true, dependsOn: true } });
  if (!pending.length) return 0;
  const done = new Set((await db.engineeringTask.findMany({ where: { projectId, status: 'DONE' }, select: { id: true } })).map((t) => t.id));
  const ready = pending.filter((t) => t.dependsOn.every((d) => done.has(d))).map((t) => t.id);
  if (!ready.length) return 0;
  const { count } = await db.engineeringTask.updateMany({ where: { id: { in: ready }, status: 'PENDING' }, data: { status: 'READY' } });
  return count;
}

async function block(p: { id: string; organizationId: string; name: string }, reason: string, kind: string) {
  await db.engineeringProject.update({ where: { id: p.id }, data: { status: 'BLOCKED', blockedReason: reason } });
  await raiseAlert({ organizationId: p.organizationId, severity: 'warning', kind: 'ENGINEERING', dedupeKey: `engineering:${p.id}:${kind}`, title: `${p.name} is blocked`, detail: reason });
}

/** Clears a project's alerts once a person unblocks it. */
export async function clearProjectAlerts(organizationId: string, projectId: string) {
  for (const kind of ['budget', 'task']) await resolveAlert(organizationId, `engineering:${projectId}:${kind}`);
}
