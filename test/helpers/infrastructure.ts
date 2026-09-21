export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://dev_to_mcp:dev_to_mcp_local@127.0.0.1:5432/dev_to_mcp";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
