import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedisRateLimiter } from "../src/adapters/cache/rate-limiter.ts";
import { createRedisClient } from "../src/adapters/cache/redis-client.ts";

import { REDIS_URL } from "./helpers/infrastructure.ts";

let redisA: ReturnType<typeof createRedisClient>;
let redisB: ReturnType<typeof createRedisClient>;

beforeAll(() => {
  redisA = createRedisClient({ url: REDIS_URL });
  redisB = createRedisClient({ url: REDIS_URL });
});

afterAll(async () => {
  await Promise.all([redisA.quit(), redisB.quit()]);
});

describe("redis-backed rate limiting", () => {
  it("enforces one shared budget across independent instances", async () => {
    const key = `cross-instance-${randomUUID()}`;
    const instanceA = createRedisRateLimiter({
      redis: redisA,
      limitPerMinute: 2,
    });
    const instanceB = createRedisRateLimiter({
      redis: redisB,
      limitPerMinute: 2,
    });

    const first = await instanceA.check(key);
    const second = await instanceB.check(key);
    const third = await instanceA.check(key);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("isolates separate subjects", async () => {
    const limiter = createRedisRateLimiter({
      redis: redisA,
      limitPerMinute: 1,
    });

    const subjectOne = await limiter.check(`subject-a-${randomUUID()}`);
    const subjectTwo = await limiter.check(`subject-b-${randomUUID()}`);

    expect(subjectOne.allowed).toBe(true);
    expect(subjectTwo.allowed).toBe(true);
  });

  it("reports a reset time within the current minute window", async () => {
    const limiter = createRedisRateLimiter({
      redis: redisA,
      limitPerMinute: 5,
    });
    const result = await limiter.check(`reset-${randomUUID()}`);

    expect(result.resetAtMs).toBeGreaterThan(Date.now() - 60_000);
    expect(result.resetAtMs).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(result.limit).toBe(5);
  });
});
