import type {
  ForemClient,
  ForemRequestContext,
  GetArticleQuery,
  GetUserQuery,
  ListArticlesQuery,
  PaginationQuery,
  SearchArticlesQuery,
} from "../../core/ports/forem-client.ts";
import type { Article, Comment, Tag, User } from "../../core/models.ts";
import {
  normalizeArticle,
  normalizeArticles,
  normalizeComments,
  normalizeTags,
  normalizeUser,
} from "../../core/schemas.ts";
import { InvalidInputError } from "../../errors/api-errors.ts";
import { HttpClient } from "../../lib/http-client.ts";
import { DevToAlgoliaSearch } from "./devto-algolia-search.ts";

const FOREM_API_URL = "https://dev.to/api";

/**
 * Forem adapter. Owns URL construction, HTTP execution, and normalization;
 * callers depend only on the transport-independent `ForemClient` port.
 */
export class ForemApiClient implements ForemClient {
  private readonly httpClient: HttpClient;

  private readonly articleSearch: DevToAlgoliaSearch;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.articleSearch = new DevToAlgoliaSearch(httpClient);
  }

  async listArticles(
    query: ListArticlesQuery,
    context: ForemRequestContext,
  ): Promise<readonly Article[]> {
    const url = new URL(`${FOREM_API_URL}/articles`);
    appendPagination(url, query);
    appendIfDefined(url, "username", query.username);
    appendIfDefined(url, "tag", query.tag);
    appendIfDefined(url, "top", query.top);
    appendIfDefined(url, "state", query.state);
    return normalizeArticles(
      await this.httpClient.getJson(url, {
        correlationId: context.correlationId,
        endpoint: "articles.list",
      }),
    );
  }

  async getArticle(
    query: GetArticleQuery,
    context: ForemRequestContext,
  ): Promise<Article> {
    if (query.id === undefined && query.path === undefined) {
      throw new InvalidInputError("Either id or path must be provided.");
    }
    const url =
      query.id !== undefined
        ? new URL(`${FOREM_API_URL}/articles/${query.id}`)
        : new URL(
            `${FOREM_API_URL}/articles/${(query.path ?? "")
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`,
          );
    return normalizeArticle(
      await this.httpClient.getJson(url, {
        correlationId: context.correlationId,
        endpoint: "articles.get",
      }),
    );
  }

  async getUser(
    query: GetUserQuery,
    context: ForemRequestContext,
  ): Promise<User> {
    const url =
      query.id === undefined
        ? new URL(`${FOREM_API_URL}/users/by_username`)
        : new URL(`${FOREM_API_URL}/users/${query.id}`);
    if (query.id === undefined) {
      if (query.username === undefined) {
        throw new InvalidInputError("Either id or username must be provided.");
      }
      url.searchParams.set("url", query.username);
    }
    return normalizeUser(
      await this.httpClient.getJson(url, {
        correlationId: context.correlationId,
        endpoint: "users.get",
      }),
    );
  }

  async listTags(
    query: PaginationQuery,
    context: ForemRequestContext,
  ): Promise<readonly Tag[]> {
    const url = new URL(`${FOREM_API_URL}/tags`);
    appendPagination(url, query);
    return normalizeTags(
      await this.httpClient.getJson(url, {
        correlationId: context.correlationId,
        endpoint: "tags.list",
      }),
    );
  }

  async listComments(
    articleId: number,
    context: ForemRequestContext,
  ): Promise<readonly Comment[]> {
    const url = new URL(`${FOREM_API_URL}/comments`);
    url.searchParams.set("a_id", String(articleId));
    return normalizeComments(
      await this.httpClient.getJson(url, {
        correlationId: context.correlationId,
        endpoint: "comments.list",
      }),
    );
  }

  async searchArticles(
    query: SearchArticlesQuery,
    context: ForemRequestContext,
  ): Promise<readonly Article[]> {
    return this.articleSearch.search(query, context);
  }
}

function appendPagination(url: URL, query: PaginationQuery): void {
  url.searchParams.set("page", String(query.page));
  url.searchParams.set("per_page", String(query.per_page));
}

function appendIfDefined(
  url: URL,
  key: string,
  value: string | number | undefined,
): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}
