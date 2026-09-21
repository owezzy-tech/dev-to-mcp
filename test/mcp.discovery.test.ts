import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { ForemClient } from "../src/core/ports/forem-client.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { DiscoveryUseCases } from "../src/core/use-cases/discovery.ts";
import { MCP_METADATA, buildMcpServer } from "../src/mcp/server.ts";
import { createToolHandlers } from "../src/mcp/tool-handlers.ts";
import { expectedTools } from "./fixtures/mcp-tools.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const unusedPort: ForemClient = {
  listArticles: async () => [],
  getArticle: async () => ({
    id: 1,
    title: "unused",
    description: null,
    slug: null,
    path: null,
    url: null,
    published_at: null,
    readable_publish_date: null,
    tag_list: [],
    comments_count: 0,
    public_reactions_count: 0,
    user: { user_id: null, username: null, name: null },
  }),
  getUser: async () => ({
    id: 1,
    username: null,
    name: null,
    summary: null,
    twitter_username: null,
    github_username: null,
    location: null,
    website_url: null,
    joined_at: null,
  }),
  listTags: async () => [],
  listComments: async () => [],
  searchArticles: async () => [],
};

describe("MCP discovery", () => {
  it("preserves the HTTP metadata body", () => {
    // Given / When / Then
    expect(MCP_METADATA).toEqual({
      name: "dev-to-mcp",
      version: "1.0.0",
      description: "MCP server for dev.to public API",
      capabilities: ["tools"],
    });
  });

  it("preserves the exact public tools/list payload", async () => {
    // Given
    const useCases = new DiscoveryUseCases(unusedPort, logger);
    const handlers = createToolHandlers({
      useCases,
      logger,
      getCorrelationId: () => "corr-discovery",
    });
    const server = buildMcpServer(handlers);
    const client = new Client({ name: "discovery-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    // When
    const result = await client.listTools();

    // Then
    expect(result.tools).toEqual(expectedTools);
    await client.close();
    await server.close();
  });
});
