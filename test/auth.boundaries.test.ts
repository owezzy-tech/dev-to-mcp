import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyBearerToken } from "../src/adapters/auth/bearer-auth.ts";
import {
  createDashboardSessionStore,
  hashSessionToken,
} from "../src/adapters/auth/session-store.ts";
import { createRedisClient } from "../src/adapters/cache/redis-client.ts";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import {
  assertCapability,
  hasCapability,
} from "../src/core/policies/authorization.ts";
import { ForbiddenError } from "../src/errors/api-errors.ts";

import { DATABASE_URL, REDIS_URL } from "./helpers/infrastructure.ts";

const TOKEN = "mcp-bearer-token-that-is-long-enough";

let prisma: ReturnType<typeof createPrismaClient>;
let redisA: ReturnType<typeof createRedisClient>;
let redisB: ReturnType<typeof createRedisClient>;
let authorId: string;

beforeAll(async () => {
  prisma = createPrismaClient({ connectionString: DATABASE_URL });
  redisA = createRedisClient({ url: REDIS_URL });
  redisB = createRedisClient({ url: REDIS_URL });

  const author = await prisma.author.create({
    data: {
      githubUserId: Math.floor(Math.random() * 1_000_000_000),
      githubLogin: `test-author-${randomUUID()}`,
    },
  });
  authorId = author.id;
});

afterAll(async () => {
  await prisma.dashboardSession.deleteMany({ where: { authorId } });
  await prisma.author.deleteMany({ where: { id: authorId } });
  await Promise.all([redisA.quit(), redisB.quit()]);
  await prisma.$disconnect();
});

describe("MCP bearer authentication boundary", () => {
  it("accepts the exact trusted token", () => {
    expect(verifyBearerToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("rejects missing, malformed, and wrong tokens", () => {
    expect(verifyBearerToken(undefined, TOKEN)).toBe(false);
    expect(verifyBearerToken("", TOKEN)).toBe(false);
    expect(verifyBearerToken(TOKEN, TOKEN)).toBe(false);
    expect(verifyBearerToken("Basic abc", TOKEN)).toBe(false);
    expect(verifyBearerToken(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(verifyBearerToken(`Bearer ${TOKEN.slice(0, -1)}a`, TOKEN)).toBe(
      false,
    );
  });
});

describe("capability authorization", () => {
  it("grants only explicitly assigned capabilities", () => {
    const granted = ["READ", "DRAFT_WRITE"] as const;

    expect(hasCapability(granted, "READ")).toBe(true);
    expect(hasCapability(granted, "PUBLISH")).toBe(false);
    expect(() => assertCapability(granted, "DRAFT_WRITE")).not.toThrow();
    expect(() => assertCapability(granted, "PUBLISH")).toThrow(ForbiddenError);
  });
});

describe("dashboard session boundary across instances", () => {
  it("issues a session that a second instance can validate", async () => {
    const issuer = createDashboardSessionStore({ prisma, redis: redisA });
    const verifier = createDashboardSessionStore({ prisma, redis: redisB });

    const { token, session } = await issuer.create({
      authorId,
      ttlSeconds: 60,
    });
    expect(token).toHaveLength(64);

    const validated = await verifier.validate(token);
    expect(validated?.authorId).toBe(authorId);
    expect(session.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("stores only a hash of the session token", async () => {
    const store = createDashboardSessionStore({ prisma, redis: redisA });
    const { token } = await store.create({ authorId, ttlSeconds: 60 });

    const rows = await prisma.dashboardSession.findMany({
      where: { authorId },
    });
    expect(rows.map((row) => row.tokenHash)).toContain(hashSessionToken(token));
    expect(rows.map((row) => row.tokenHash)).not.toContain(token);
  });

  it("rejects a revoked session for every instance", async () => {
    const issuer = createDashboardSessionStore({ prisma, redis: redisA });
    const verifier = createDashboardSessionStore({ prisma, redis: redisB });

    const { token } = await issuer.create({ authorId, ttlSeconds: 60 });
    await expect(verifier.validate(token)).resolves.toBeDefined();

    await issuer.revoke(token);
    await expect(verifier.validate(token)).resolves.toBeUndefined();
  });

  it("expires sessions once the shared TTL elapses", async () => {
    const issuer = createDashboardSessionStore({ prisma, redis: redisA });
    const verifier = createDashboardSessionStore({ prisma, redis: redisB });

    const { token } = await issuer.create({ authorId, ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    await expect(verifier.validate(token)).resolves.toBeUndefined();
  });
});
