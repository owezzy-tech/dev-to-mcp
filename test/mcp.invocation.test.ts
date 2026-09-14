import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { Article, Comment, Tag, User } from "../src/core/models.ts";
import type {
  ForemClient,
  ForemRequestContext,
  GetArticleQuery,
  GetUserQuery,
  ListArticlesQuery,
  PaginationQuery,
  SearchArticlesQuery,
} from "../src/core/ports/forem-client.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { DiscoveryUseCases } from "../src/core/use-cases/discovery.ts";
import { createToolHandlers } from "../src/mcp/tool-handlers.ts";

const article: Article = {
  id: 1,
  title: "Article",
  description: null,
  slug: "article",
  path: "/ada/article",
  url: "https://dev.to/ada/article",
  published_at: null,
  readable_publish_date: null,
  tag_list: [],
  comments_count: 0,
  public_reactions_count: 0,
  user: { user_id: 7, username: "ada", name: "Ada" },
};

const user: User = {
  id: 7,
  username: "ada",
  name: "Ada",
  summary: null,
  twitter_username: null,
  github_username: null,
  location: null,
  website_url: null,
  joined_at: null,
};

const tag: Tag = {
  id: 2,
  name: "mcp",
  bg_color_hex: null,
  text_color_hex: null,
  short_summary: null,
};

const comment: Comment = {
  id: "abc1",
  body_html: "<p>Hello</p>",
  created_at: null,
  user: { user_id: 7, username: "ada", name: "Ada" },
  children: [],
};

class FakeForemClient implements ForemClient {
  readonly calls: string[] = [];

  async listArticles(
    _query: ListArticlesQuery,
    _context: ForemRequestContext,
  ): Promise<readonly Article[]> {
    this.calls.push("listArticles");
    return [article];
  }

  async getArticle(
    _query: GetArticleQuery,
    _context: ForemRequestContext,
  ): Promise<Article> {
    this.calls.push("getArticle");
    return article;
  }

  async getUser(
    _query: GetUserQuery,
    _context: ForemRequestContext,
  ): Promise<User> {
    this.calls.push("getUser");
    return user;
  }

  async listTags(
    _query: PaginationQuery,
    _context: ForemRequestContext,
  ): Promise<readonly Tag[]> {
    this.calls.push("listTags");
    return [tag];
  }

  async listComments(
    _articleId: number,
    _context: ForemRequestContext,
  ): Promise<readonly Comment[]> {
    this.calls.push("listComments");
    return [comment];
  }

  async searchArticles(
    _query: SearchArticlesQuery,
    _context: ForemRequestContext,
  ): Promise<readonly Article[]> {
    this.calls.push("searchArticles");
    return [article];
  }
}

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function parseTextResult(result: CallToolResult): unknown {
  const first = result.content[0];
  if (first === undefined || first.type !== "text") {
    throw new Error("Expected a text result");
  }
  return JSON.parse(first.text) as unknown;
}

describe("shared MCP tool handlers", () => {
  it("delegates all six tools through the shared discovery use cases", async () => {
    // Given
    const port = new FakeForemClient();
    const handlers = createToolHandlers({
      useCases: new DiscoveryUseCases(port, logger),
      logger,
      getCorrelationId: () => "corr-invocation",
    });

    // When
    const results = await Promise.all([
      handlers.getArticles({ page: 1, per_page: 30 }),
      handlers.getArticle({ id: 1 }),
      handlers.getUser({ username: "ada" }),
      handlers.getTags({ page: 1, per_page: 10 }),
      handlers.getComments({ article_id: 1 }),
      handlers.searchArticles({ q: "mcp", page: 1, per_page: 30 }),
    ]);

    // Then
    expect(port.calls).toEqual([
      "listArticles",
      "getArticle",
      "getUser",
      "listTags",
      "listComments",
      "searchArticles",
    ]);
    expect(results.map(parseTextResult)).toEqual([
      [article],
      article,
      user,
      [tag],
      [comment],
      [article],
    ]);
  });

  it("rejects invalid pagination before calling the port", async () => {
    // Given
    const port = new FakeForemClient();
    const handlers = createToolHandlers({
      useCases: new DiscoveryUseCases(port, logger),
      logger,
      getCorrelationId: () => "corr-pagination",
    });

    // When
    const result = await handlers.getArticles({ page: 0, per_page: 30 });

    // Then
    expect(port.calls).toEqual([]);
    expect(result.isError).toBe(true);
    expect(parseTextResult(result)).toEqual({
      message: "Pagination values are outside the supported range.",
      code: "INVALID_INPUT",
      correlationId: "corr-pagination",
    });
  });
});
