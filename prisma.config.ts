import { defineConfig } from "prisma/config";

const LOCAL_DATABASE_URL =
  "postgresql://dev_to_mcp:dev_to_mcp_local@127.0.0.1:5432/dev_to_mcp";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  },
});
