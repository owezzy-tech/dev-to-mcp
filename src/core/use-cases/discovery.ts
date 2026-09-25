import { InvalidInputError } from "../../errors/api-errors.ts";
import type { Article, Comment, Tag, User } from "../models.ts";
import type {
  ForemClient,
  GetArticleQuery,
  GetUserQuery,
  ListArticlesQuery,
  SearchArticlesQuery,
} from "../ports/forem-client.ts";
import type { AppLogger } from "../ports/logger.ts";
import {
  requireArticlePath,
  requirePositiveInteger,
} from "../policies/identifiers.ts";
import { parsePagination } from "../policies/pagination.ts";

/**
 * Transport-independent discovery use cases.
 *
 * Every MCP and REST adapter funnels through these methods, so pagination and
 * identifier policy is enforced once, before the Forem port is touched.
 */
export class DiscoveryUseCases {
  private readonly foremClient: ForemClient;

  private readonly logger: AppLogger;

  constructor(foremClient: ForemClient, logger: AppLogger) {
    this.foremClient = foremClient;
    this.logger = logger;
  }

  listArticles(
    query: ListArticlesQuery,
    correlationId: string,
  ): Promise<readonly Article[]> {
    const pagination = parsePagination(query);
    this.logger.debug(
      { correlationId, operation: "listArticles" },
      "discovery.call",
    );
    return this.foremClient.listArticles(
      { ...query, ...pagination },
      { correlationId },
    );
  }

  getArticle(query: GetArticleQuery, correlationId: string): Promise<Article> {
    if (query.id === undefined && query.path === undefined) {
      throw new InvalidInputError("Either id or path must be provided.");
    }
    if (query.id !== undefined) {
      requirePositiveInteger(query.id, "Article ID");
    }
    const normalized =
      query.id === undefined && query.path !== undefined
        ? { ...query, path: requireArticlePath(query.path) }
        : query;
    this.logger.debug(
      { correlationId, operation: "getArticle" },
      "discovery.call",
    );
    return this.foremClient.getArticle(normalized, { correlationId });
  }

  getUser(query: GetUserQuery, correlationId: string): Promise<User> {
    if (query.id === undefined && query.username === undefined) {
      throw new InvalidInputError("Either id or username must be provided.");
    }
    if (query.id !== undefined) {
      requirePositiveInteger(query.id, "User ID");
    }
    this.logger.debug(
      { correlationId, operation: "getUser" },
      "discovery.call",
    );
    return this.foremClient.getUser(query, { correlationId });
  }

  listTags(
    page: number,
    perPage: number,
    correlationId: string,
  ): Promise<readonly Tag[]> {
    const pagination = parsePagination({ page, per_page: perPage });
    this.logger.debug(
      { correlationId, operation: "listTags" },
      "discovery.call",
    );
    return this.foremClient.listTags(pagination, { correlationId });
  }

  listComments(
    articleId: number,
    correlationId: string,
  ): Promise<readonly Comment[]> {
    requirePositiveInteger(articleId, "Article ID");
    this.logger.debug(
      { correlationId, operation: "listComments" },
      "discovery.call",
    );
    return this.foremClient.listComments(articleId, { correlationId });
  }

  searchArticles(
    query: SearchArticlesQuery,
    correlationId: string,
  ): Promise<readonly Article[]> {
    const pagination = parsePagination(query);
    this.logger.debug(
      { correlationId, operation: "searchArticles" },
      "discovery.call",
    );
    return this.foremClient.searchArticles(
      { ...query, ...pagination },
      { correlationId },
    );
  }
}
