import { PrismaClient } from '@prisma/client';
import { SOLUTION_TEMPLATES } from './seeds/solution-templates';
import { EXTRA_TEMPLATES } from './seeds/solution-templates-extra';
import { solutionSpecSchema } from '../src/server/services/templates/spec';
import { seedDemoClients } from './seeds/demo-clients';

const db = new PrismaClient();

/**
 * Seeds the built-in solution library. These rows have organizationId = null,
 * which marks them as platform templates: every workspace can read them, and
 * an agency that customizes one gets a copy scoped to itself rather than
 * editing the shared original.
 *
 * Idempotent — safe to re-run after editing a seed.
 */
async function main() {
  const all = [...SOLUTION_TEMPLATES, ...EXTRA_TEMPLATES];
  console.log(`Seeding ${all.length} solution templates…`);

  for (const template of all) {
    // Validate before writing. A malformed spec would render as a broken demo
    // in front of a prospect, which is the worst place to discover it.
    const parsed = solutionSpecSchema.safeParse(template.spec);
    if (!parsed.success) {
      console.error(`✗ ${template.slug} failed validation:`);
      for (const issue of parsed.error.issues) {
        console.error(`    ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exitCode = 1;
      continue;
    }

    const existing = await db.solutionTemplate.findFirst({
      where: { organizationId: null, slug: template.slug },
    });

    if (existing) {
      await db.solutionTemplate.update({
        where: { id: existing.id },
        data: {
          industry: template.industry,
          title: template.title,
          tagline: template.tagline,
          description: template.description,
          accentColor: template.accentColor,
          spec: parsed.data as never,
          sampleData: {} as never,
          workflowDiagram: parsed.data.workflows[0] as never,
          isPublished: true,
          version: existing.version + 1,
        },
      });
      console.log(`  ↻ ${template.slug} (v${existing.version + 1})`);
    } else {
      await db.solutionTemplate.create({
        data: {
          organizationId: null,
          slug: template.slug,
          industry: template.industry,
          title: template.title,
          tagline: template.tagline,
          description: template.description,
          accentColor: template.accentColor,
          spec: parsed.data as never,
          sampleData: {} as never,
          workflowDiagram: parsed.data.workflows[0] as never,
          isPublished: true,
        },
      });
      console.log(`  + ${template.slug}`);
    }
  }

  // Optional: example clients for a workspace that already exists (workspaces
  // are created through Clerk). Set SEED_DEMO_WORKSPACE to its slug.
  const demoSlug = process.env.SEED_DEMO_WORKSPACE;
  if (demoSlug) {
    const org = await db.organization.findFirst({ where: { slug: demoSlug, deletedAt: null } });
    if (!org) {
      console.error(`No workspace with slug "${demoSlug}".`);
      process.exitCode = 1;
    } else {
      console.log(`Seeding example clients into ${org.name}…`);
      await seedDemoClients(db, org.id);
    }
  }

  console.log('Done.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
