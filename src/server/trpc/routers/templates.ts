import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { router, permissionProcedure } from '../init';
import { solutionSpecSchema } from '@/server/services/templates/spec';

export const templatesRouter = router({
  /**
   * Platform templates (organizationId null) plus this workspace's own
   * customizations. A workspace copy shadows the built-in of the same slug.
   */
  list: permissionProcedure('proposal:read')
    .input(z.object({ industry: z.string().max(80).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const templates = await ctx.db.solutionTemplate.findMany({
        where: {
          isPublished: true,
          OR: [{ organizationId: null }, { organizationId: ctx.access.organizationId }],
          ...(input.industry ? { industry: input.industry } : {}),
        },
        orderBy: [{ industry: 'asc' }],
        select: {
          id: true, slug: true, industry: true, title: true, tagline: true,
          description: true, accentColor: true, organizationId: true, version: true,
        },
      });

      const bySlug = new Map<string, (typeof templates)[number]>();
      for (const t of templates) {
        const existing = bySlug.get(t.slug);
        if (!existing || t.organizationId) bySlug.set(t.slug, t);
      }
      return [...bySlug.values()];
    }),

  bySlug: permissionProcedure('proposal:read')
    .input(z.object({ slug: z.string().max(80) }))
    .query(async ({ ctx, input }) => {
      const templates = await ctx.db.solutionTemplate.findMany({
        where: {
          slug: input.slug,
          OR: [{ organizationId: null }, { organizationId: ctx.access.organizationId }],
        },
      });
      const template = templates.find((t) => t.organizationId) ?? templates[0];
      if (!template) throw new TRPCError({ code: 'NOT_FOUND' });

      const spec = solutionSpecSchema.safeParse(template.spec);
      if (!spec.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'This template has an invalid spec.' });
      }
      return { ...template, spec: spec.data };
    }),

  /**
   * Forks a platform template into an editable workspace copy. The built-in is
   * never mutated, so a bad edit can always be undone by deleting the fork.
   */
  fork: permissionProcedure('settings:write')
    .input(z.object({ slug: z.string().max(80) }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.db.solutionTemplate.findFirst({
        where: { slug: input.slug, organizationId: null },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND' });

      const existing = await ctx.db.solutionTemplate.findFirst({
        where: { slug: input.slug, organizationId: ctx.access.organizationId },
      });
      if (existing) return existing;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, organizationId, createdAt, updatedAt, ...rest } = source;
      return ctx.db.solutionTemplate.create({
        data: {
          ...rest,
          organizationId: ctx.access.organizationId,
          version: 1,
          spec: rest.spec as Prisma.InputJsonValue,
          sampleData: rest.sampleData as Prisma.InputJsonValue,
          workflowDiagram: rest.workflowDiagram ?? Prisma.JsonNull,
        },
      });
    }),

  update: permissionProcedure('settings:write')
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(160).optional(),
      tagline: z.string().max(200).optional(),
      description: z.string().max(2000).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      spec: solutionSpecSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const owned = await ctx.db.solutionTemplate.count({
        where: { id, organizationId: ctx.access.organizationId },
      });
      // Guards against editing a built-in through a guessed id.
      if (!owned) throw new TRPCError({ code: 'FORBIDDEN', message: 'Fork this template before editing it.' });

      return ctx.db.solutionTemplate.update({
        where: { id },
        data: { ...data, spec: data.spec as never, version: { increment: 1 } },
      });
    }),
});
