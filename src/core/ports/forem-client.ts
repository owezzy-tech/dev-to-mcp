import type { Article, Comment, Tag, User } from "../models.ts";
import type { Pagination } from "../policies/pagination.ts";

export type ForemRequestContext = {
  readonly correlationId: string;
};

export type PaginationQuery = Pagination;

export type ListArticlesQuery = Pagination & {
  readonly username?: string;
  readonly tag?: string;
  readonly top?: number;
  readonly state?: string;
};

export type GetArticleQuery = {
  readonly id?: number;
  readonly path?: string;
};

export type GetUserQuery = {
  readonly id?: number;
  readonly username?: string;
};

export type SearchArticlesQuery = Pagination & {
  readonly q: string;
  readonly search_fields?: string;
};

export interface ForemClient {
  listArticles(
    query: ListArticlesQuery,
    context: ForemRequestContext,
  ): Promise<readonly Article[]>;
  getArticle(
    query: GetArticleQuery,
    context: ForemRequestContext,
  ): Promise<Article>;
  getUser(query: GetUserQuery, context: ForemRequestContext): Promise<User>;
  listTags(
    query: PaginationQuery,
    context: ForemRequestContext,
  ): Promise<readonly Tag[]>;
  listComments(
    articleId: number,
    context: ForemRequestContext,
  ): Promise<readonly Comment[]>;
  searchArticles(
    query: SearchArticlesQuery,
    context: ForemRequestContext,
  ): Promise<readonly Article[]>;
}
