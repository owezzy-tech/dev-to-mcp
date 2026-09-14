import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolHandlers } from "./tool-handlers.ts";
import {
  getArticleInputSchema,
  getArticlesInputSchema,
  getCommentsInputSchema,
  getTagsInputSchema,
  getUserInputSchema,
  searchArticlesInputSchema,
} from "./tool-schemas.ts";

/**
 * The `GET /mcp` metadata body. Guarded byte-for-byte by
 * `test/mcp.characterization.test.ts`.
 */
export const MCP_METADATA = {
  name: "dev-to-mcp",
  version: "1.0.0",
  description: "MCP server for dev.to public API",
  capabilities: ["tools"],
} as const;

export type McpServerIdentity = {
  readonly name: string;
  readonly version: string;
};

/**
 * Public tool annotations. Only these two hints are published; adding more
 * would change the `tools/list` payload guarded by
 * `test/fixtures/mcp-tools.ts`.
 */
const annotations = {
  readOnlyHint: true,
  openWorldHint: true,
} as const;

export function buildMcpServer(
  handlers: ToolHandlers,
  identity: McpServerIdentity = MCP_METADATA,
): McpServer {
  const server = new McpServer(identity);

  server.registerTool(
    "get_articles",
    {
      title: "Get Articles",
      description:
        "Get articles from dev.to. Can filter by username, tag, or other parameters.",
      annotations,
      inputSchema: getArticlesInputSchema,
    },
    handlers.getArticles,
  );

  server.registerTool(
    "get_article",
    {
      title: "Get Article",
      description: "Get a specific article by ID or path",
      annotations,
      inputSchema: getArticleInputSchema,
    },
    handlers.getArticle,
  );

  server.registerTool(
    "get_user",
    {
      title: "Get User",
      description: "Get user information by ID or username",
      annotations,
      inputSchema: getUserInputSchema,
    },
    handlers.getUser,
  );

  server.registerTool(
    "get_tags",
    {
      title: "Get Tags",
      description: "Get popular tags from dev.to",
      annotations,
      inputSchema: getTagsInputSchema,
    },
    handlers.getTags,
  );

  server.registerTool(
    "get_comments",
    {
      title: "Get Comments",
      description: "Get comments for a specific article",
      annotations,
      inputSchema: getCommentsInputSchema,
    },
    handlers.getComments,
  );

  server.registerTool(
    "search_articles",
    {
      title: "Search Articles",
      description: "Search articles using query parameters",
      annotations,
      inputSchema: searchArticlesInputSchema,
    },
    handlers.searchArticles,
  );

  return server;
}
