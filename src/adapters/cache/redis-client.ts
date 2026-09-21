import { Redis } from "ioredis";

export interface RedisFactoryOptions {
  readonly url: string;
  readonly keyPrefix?: string;
}

export function createRedisClient(options: RedisFactoryOptions): Redis {
  return new Redis(options.url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    ...(options.keyPrefix === undefined
      ? {}
      : { keyPrefix: options.keyPrefix }),
  });
}
