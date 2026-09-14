import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Capability } from "../../src/core/policies/authorization.ts";

export async function createTestAuthor(
  prisma: PrismaClient,
  capabilities: readonly Capability[],
): Promise<string> {
  const author = await prisma.author.create({
    data: {
      githubUserId: Math.floor(Math.random() * 1_000_000_000),
      githubLogin: `am-author-${randomUUID()}`,
      authorizations: {
        create: capabilities.map((capability) => ({ capability })),
      },
    },
  });
  return author.id;
}

export async function cleanupAuthor(
  prisma: PrismaClient,
  authorId: string,
): Promise<void> {
  await prisma.workflowRun.deleteMany({ where: { authorId } });
  await prisma.approval.deleteMany({ where: { authorId } });
  await prisma.auditEvent.deleteMany({ where: { authorId } });
  await prisma.draft.updateMany({
    where: { authorId },
    data: { currentVersionId: null },
  });
  await prisma.draft.deleteMany({ where: { authorId } });
  await prisma.author.deleteMany({ where: { id: authorId } });
}
