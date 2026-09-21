import type { Redis } from "ioredis";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtMs: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

export interface RedisRateLimiterOptions {
  readonly redis: Redis;
  readonly limitPerMinute: number;
  readonly now?: () => number;
}

const WINDOW_MS = 60_000;

export function createRedisRateLimiter(
  options: RedisRateLimiterOptions,
): RateLimiter {
  const now = options.now ?? Date.now;
  const limit = options.limitPerMinute;

  return {
    async check(key: string): Promise<RateLimitResult> {
      const windowStart = Math.floor(now() / WINDOW_MS) * WINDOW_MS;
      const resetAtMs = windowStart + WINDOW_MS;
      const redisKey = `ratelimit:${key}:${windowStart}`;

      const count = await options.redis.incr(redisKey);
      if (count === 1) {
        await options.redis.expire(redisKey, Math.ceil(WINDOW_MS / 1000) * 2);
      }

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetAtMs,
      };
    },
  };
}
