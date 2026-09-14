import type { ForemRequestContext } from "../../core/ports/forem-client.ts";
import type {
  DraftArticleInput,
  ForemArticleRecord,
  ForemArticleState,
  ForemPublisher,
  UpdateDraftArticleInput,
} from "../../core/ports/forem-publisher.ts";
import { UpstreamPayloadError } from "../../errors/api-errors.ts";
import type { HttpClient } from "../../lib/http-client.ts";

const FOREM_API_URL = "https://dev.to/api";

const ARTICLE_LIST_PATHS: Readonly<Record<ForemArticleState, string>> = {
  published: "articles/me/published",
  unpublished: "articles/me/unpublished",
  all: "articles/me/all",
};

export interface ForemPublisherClientOptions {
  readonly httpClient: HttpClient;
  readonly apiKey: string;
  readonly apiVersion?: string;
}

type ForemArticlePayload = {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
  readonly published?: boolean;
  readonly published_at?: string | null;
};

export function createForemPublisherClient(
  options: ForemPublisherClientOptions,
): ForemPublisher {
  const apiVersion = options.apiVersion ?? "v1";
  const headers = {
    "api-key": options.apiKey,
    accept: `application/vnd.forem.api-${apiVersion}+json`,
  };

  async function readArticle(
    url: URL,
    method: "GET" | "POST" | "PUT",
    body: unknown,
    context: ForemRequestContext,
    endpoint: string,
  ): Promise<ForemArticleRecord> {
    const payload = await options.httpClient.request(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      correlationId: context.correlationId,
      endpoint,
    });
    return toArticleRecord(payload);
  }

  return {
    async listMyArticles(input, context) {
      const url = new URL(
        `${FOREM_API_URL}/${ARTICLE_LIST_PATHS[input.state]}`,
      );
      const payload = await options.httpClient.request(url, {
        method: "GET",
        headers,
        correlationId: context.correlationId,
        endpoint: "articles.me.list",
      });
      if (!Array.isArray(payload)) {
        throw new UpstreamPayloadError();
      }
      return payload.map(toArticleRecord);
    },

    createArticleDraft(input, context) {
      return readArticle(
        new URL(`${FOREM_API_URL}/articles`),
        "POST",
        { article: toArticleBody(input) },
        context,
        "articles.create",
      );
    },

    updateArticleDraft(input, context) {
      return readArticle(
        new URL(`${FOREM_API_URL}/articles/${input.id}`),
        "PUT",
        { article: toArticleBody(input) },
        context,
        "articles.update",
      );
    },

    publishArticle(input, context) {
      return readArticle(
        new URL(`${FOREM_API_URL}/articles/${input.id}`),
        "PUT",
        { article: { published: true } },
        context,
        "articles.publish",
      );
    },
  };
}

function toArticleBody(
  input: DraftArticleInput | UpdateDraftArticleInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if ("title" in input && input.title !== undefined) {
    body.title = input.title;
  }
  if ("bodyMarkdown" in input && input.bodyMarkdown !== undefined) {
    body.body_markdown = input.bodyMarkdown;
  }
  if ("tags" in input && input.tags !== undefined) {
    body.tags = [...input.tags];
  }
  if ("description" in input && input.description !== undefined) {
    body.description = input.description;
  }
  if ("canonicalUrl" in input && input.canonicalUrl !== undefined) {
    body.canonical_url = input.canonicalUrl;
  }
  if ("coverImage" in input && input.coverImage !== undefined) {
    body.main_image = input.coverImage;
  }
  body.published = false;
  return body;
}

function toArticleRecord(payload: unknown): ForemArticleRecord {
  if (payload === null || typeof payload !== "object") {
    throw new UpstreamPayloadError();
  }
  const article = payload as ForemArticlePayload;
  if (typeof article.id !== "number" || typeof article.title !== "string") {
    throw new UpstreamPayloadError();
  }
  return {
    id: article.id,
    title: article.title,
    url: article.url ?? "",
    published: article.published === true,
    publishedAt: article.published_at ?? null,
  };
}
