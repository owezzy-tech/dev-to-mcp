import { describe, expect, it } from "vitest";
import type { ForemClient } from "../src/core/ports/forem-client.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { DiscoveryUseCases } from "../src/core/use-cases/discovery.ts";
import { createToolHandlers } from "../src/mcp/tool-handlers.ts";

const secret = "SENTINEL_TOOL_SECRET";

const failingPort: ForemClient = {
  listArticles: async () => {
    throw new Error(`raw=https://dev.to/api/articles?token=${secret}`);
  },
  getArticle: async () => {
    throw new Error(secret);
  },
  getUser: async () => {
    throw new Error(secret);
  },
  listTags: async () => {
    throw new Error(secret);
  },
  listComments: async () => {
    throw new Error(secret);
  },
  searchArticles: async () => {
    throw new Error(secret);
  },
};

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe("MCP public errors", () => {
  it("returns a correlated safe error without internal details", async () => {
    // Given
    const handlers = createToolHandlers({
      useCases: new DiscoveryUseCases(failingPort, logger),
      logger,
      getCorrelationId: () => "corr-error",
    });

    // When
    const result = await handlers.getArticles({ page: 1, per_page: 30 });
    const first = result.content[0];
    const output =
      first !== undefined && first.type === "text" ? first.text : "";

    // Then
    expect(result.isError).toBe(true);
    expect(JSON.parse(output)).toEqual({
      message: "An internal error occurred.",
      code: "INTERNAL_ERROR",
      correlationId: "corr-error",
    });
    expect(output).not.toContain(secret);
    expect(output).not.toContain("stack");
    expect(output).not.toContain("token=");
  });
});
