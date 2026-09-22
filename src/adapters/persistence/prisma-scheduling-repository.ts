import type { PrismaClient } from "@prisma/client";
import type { SchedulingRepository } from "../../core/ports/scheduling-repository.ts";

/**
 * Prisma-backed scheduling state over `authorConfig` (topics + cadence) and
 * `workflowRun` (last-run bookkeeping).
 */
export class PrismaSchedulingRepository implements SchedulingRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getTopics(authorId: string): Promise<readonly string[]> {
    const config = await this.prisma.authorConfig.findUnique({
      where: { authorId },
      select: { topics: true },
    });
    return config?.topics ?? [];
  }

  async setTopics(authorId: string, topics: readonly string[]): Promise<void> {
    await this.prisma.authorConfig.upsert({
      where: { authorId },
      create: { authorId, topics: [...topics] },
      update: { topics: [...topics] },
    });
  }

  async getCadence(authorId: string): Promise<string> {
    const config = await this.prisma.authorConfig.findUnique({
      where: { authorId },
      select: { weeklyCadence: true },
    });
    return config?.weeklyCadence ?? "weekly";
  }

  async getLastRunAtMs(authorId: string): Promise<number | null> {
    const latest = await this.prisma.workflowRun.findFirst({
      where: { authorId },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    return latest?.startedAt.getTime() ?? null;
  }
}
