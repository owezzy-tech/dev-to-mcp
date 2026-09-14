import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";

export interface DashboardSession {
  readonly authorId: string;
  readonly expiresAtMs: number;
}

export interface DashboardSessionStore {
  create(input: {
    authorId: string;
    ttlSeconds: number;
  }): Promise<{ token: string; session: DashboardSession }>;
  validate(token: string): Promise<DashboardSession | undefined>;
  revoke(token: string): Promise<void>;
}

export interface DashboardSessionStoreOptions {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly now?: () => number;
}

const TOKEN_PREFIX = "dash:session:";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createDashboardSessionStore(
  options: DashboardSessionStoreOptions,
): DashboardSessionStore {
  const now = options.now ?? Date.now;
  const redisKey = (tokenHash: string) => `${TOKEN_PREFIX}${tokenHash}`;

  return {
    async create(input) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashSessionToken(token);
      const expiresAt = new Date(now() + input.ttlSeconds * 1000);

      await options.prisma.dashboardSession.create({
        data: { authorId: input.authorId, tokenHash, expiresAt },
      });
      await options.redis.set(
        redisKey(tokenHash),
        input.authorId,
        "EX",
        input.ttlSeconds,
      );

      return {
        token,
        session: { authorId: input.authorId, expiresAtMs: expiresAt.getTime() },
      };
    },

    async validate(token) {
      const tokenHash = hashSessionToken(token);

      const cachedAuthorId = await options.redis.get(redisKey(tokenHash));
      if (cachedAuthorId !== null) {
        const ttlSeconds = await options.redis.ttl(redisKey(tokenHash));
        return {
          authorId: cachedAuthorId,
          expiresAtMs: now() + Math.max(0, ttlSeconds) * 1000,
        };
      }

      const row = await options.prisma.dashboardSession.findUnique({
        where: { tokenHash },
      });
      if (row === null || row.revokedAt !== null) {
        return undefined;
      }
      const expiresAtMs = row.expiresAt.getTime();
      if (expiresAtMs <= now()) {
        return undefined;
      }

      const remainingSeconds = Math.ceil((expiresAtMs - now()) / 1000);
      await options.redis.set(
        redisKey(tokenHash),
        row.authorId,
        "EX",
        remainingSeconds,
      );
      return { authorId: row.authorId, expiresAtMs };
    },

    async revoke(token) {
      const tokenHash = hashSessionToken(token);
      await options.prisma.dashboardSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date(now()) },
      });
      await options.redis.del(redisKey(tokenHash));
    },
  };
}
