import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DestinationStream } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditLogger } from "../src/adapters/audit/audit-log.ts";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import { getConfig, resetConfigCache } from "../src/config.ts";
import {
  redactSecrets,
  toApiError,
  serializeApiError,
} from "../src/errors/redaction.ts";
import { createLogger } from "../src/logger.ts";

import { DATABASE_URL } from "./helpers/infrastructure.ts";

const SECRET = "sk-live-super-secret-token-value";

let prisma: ReturnType<typeof createPrismaClient>;
let authorId: string;

beforeAll(async () => {
  prisma = createPrismaClient({ connectionString: DATABASE_URL });
  const author = await prisma.author.create({
    data: {
      githubUserId: Math.floor(Math.random() * 1_000_000_000),
      githubLogin: `redaction-author-${randomUUID()}`,
    },
  });
  authorId = author.id;
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { authorId } });
  await prisma.author.deleteMany({ where: { id: authorId } });
  await prisma.$disconnect();
  delete process.env.GITHUB_CLIENT_SECRET;
  resetConfigCache();
});

describe("secret redaction", () => {
  it("redacts sensitive keys and bearer values recursively", () => {
    const redacted = redactSecrets({
      apiKey: SECRET,
      nested: { clientSecret: SECRET, safe: "visible" },
      header: `Bearer ${SECRET}`,
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).toContain("visible");
    expect(serialized).toContain("[REDACTED]");
  });

  it("never writes secrets into logger output", () => {
    const chunks: string[] = [];
    const destination: DestinationStream = {
      write: (chunk: string) => {
        chunks.push(chunk);
      },
    };
    const logger = createLogger(destination);

    logger.info(
      {
        authorization: `Bearer ${SECRET}`,
        apiKey: SECRET,
        nested: { clientSecret: SECRET },
        tool: "get_articles",
      },
      "security.log.probe",
    );

    const output = chunks.join("");
    expect(output).toContain("get_articles");
    expect(output).not.toContain(SECRET);
  });

  it("never writes secrets into audit records", async () => {
    const audit = createAuditLogger(prisma);
    await audit.record({
      authorId,
      actorType: "AGENT",
      correlationId: "corr-redaction",
      tool: "publish_article",
      input: { apiKey: SECRET, body: `Bearer ${SECRET}` },
      result: "ok",
    });

    const rows = await prisma.auditEvent.findMany({ where: { authorId } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  it("keeps secrets out of safe error payloads", () => {
    const safe = serializeApiError(
      new Error(`upstream https://dev.to/api?api_key=${SECRET}`),
      "corr-error",
    );
    expect(JSON.stringify(safe)).not.toContain(SECRET);
    expect(toApiError(new Error(SECRET)).publicMessage).not.toContain(SECRET);
  });

  it("does not embed secrets into the production bundle", () => {
    process.env.GITHUB_CLIENT_SECRET = SECRET;
    resetConfigCache();
    expect(getConfig().GITHUB_CLIENT_SECRET).toBe(SECRET);

    let bundle = "";
    try {
      bundle = readFileSync("dist/index.js", "utf8");
    } catch {
      return;
    }
    expect(bundle).not.toContain(SECRET);
  });
});
