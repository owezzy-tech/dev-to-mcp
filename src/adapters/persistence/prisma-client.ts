import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export interface PrismaClientFactoryOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
}

export function createPrismaClient(
  options: PrismaClientFactoryOptions,
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    ...(options.maxConnections === undefined
      ? {}
      : { max: options.maxConnections }),
  });
  return new PrismaClient({ adapter });
}

let shared: PrismaClient | undefined;

export function getPrismaClient(
  options: PrismaClientFactoryOptions,
): PrismaClient {
  shared ??= createPrismaClient(options);
  return shared;
}

export async function disposePrismaClient(): Promise<void> {
  if (shared === undefined) {
    return;
  }
  const client = shared;
  shared = undefined;
  await client.$disconnect();
}
