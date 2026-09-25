import type {
  ForemRequestContext,
  SearchArticlesQuery,
} from "../../core/ports/forem-client.ts";
import type { Article } from "../../core/models.ts";
import { normalizeArticles } from "../../core/schemas.ts";
import {
  InvalidInputError,
  UpstreamHttpError,
  UpstreamPayloadError,
} from "../../errors/api-errors.ts";
import type { HttpClient } from "../../lib/http-client.ts";

const DEVTO_ORIGIN = "https://dev.to";
const ARTICLE_INDEX = "Article_production";

/** Public `search_fields` names mapped to dev.to's Algolia attributes. */
const SEARCH_FIELDS: Readonly<Record<string, string>> = {
  title: "title",
  body_text: "body",
  tag_list: "tag_list",
};

type AlgoliaCredentials = {
  readonly appId: string;
  readonly searchKey: string;
};

type AlgoliaHit = {
  readonly objectID?: unknown;
  readonly title?: unknown;
  readonly path?: unknown;
  readonly published_at?: unknown;
  readonly readable_publish_date?: unknown;
  readonly tag_list?: unknown;
  readonly comments_count?: unknown;
  readonly public_reactions_count?: unknown;
  readonly user?: {
    readonly id?: unknown;
    readonly username?: unknown;
    readonly name?: unknown;
  };
};

/**
 * Article search. dev.to retired `/api/search/feed_content`; its site search
 * now queries Algolia with a public search-only key embedded in the
 * `/search` page. The key is read from that page on first use and re-read
 * once when Algolia rejects it, so a rotated key recovers without a restart.
 */
export class DevToAlgoliaSearch {
  private readonly httpClient: HttpClient;

  private credentials: Promise<AlgoliaCredentials> | undefined;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  async search(
    query: SearchArticlesQuery,
    context: ForemRequestContext,
  ): Promise<readonly Article[]> {
    const params = buildParams(query);
    try {
      return await this.query(params, context);
    } catch (error) {
      if (!(error instanceof UpstreamHttpError) || error.statusCode !== 403) {
        throw error;
      }
      this.credentials = undefined;
      return this.query(params, context);
    }
  }

  private async query(
    params: URLSearchParams,
    context: ForemRequestContext,
  ): Promise<readonly Article[]> {
    const { appId, searchKey } = await this.loadCredentials(context);
    const url = new URL(
      `https://${appId}-dsn.algolia.net/1/indexes/${ARTICLE_INDEX}`,
    );
    url.search = params.toString();
    const payload = await this.httpClient.request(url, {
      correlationId: context.correlationId,
      endpoint: "articles.search",
      method: "GET",
      headers: {
        "x-algolia-application-id": appId,
        "x-algolia-api-key": searchKey,
      },
    });
    const hits = (payload as { hits?: unknown } | null)?.hits;
    if (!Array.isArray(hits)) {
      throw new UpstreamPayloadError();
    }
    return normalizeArticles(hits.map((hit: AlgoliaHit) => toArticle(hit)));
  }

  private loadCredentials(
    context: ForemRequestContext,
  ): Promise<AlgoliaCredentials> {
    this.credentials ??= this.fetchCredentials(context).catch(
      (error: unknown) => {
        this.credentials = undefined;
        throw error;
      },
    );
    return this.credentials;
  }

  private async fetchCredentials(
    context: ForemRequestContext,
  ): Promise<AlgoliaCredentials> {
    const html = await this.httpClient.getText(
      new URL(`${DEVTO_ORIGIN}/search`),
      { correlationId: context.correlationId, endpoint: "search.credentials" },
    );
    const appId = /data-algolia-id="([A-Za-z0-9]+)"/.exec(html)?.[1];
    const searchKey = /data-algolia-search-key="([A-Za-z0-9]+)"/.exec(
      html,
    )?.[1];
    if (appId === undefined || searchKey === undefined) {
      throw new UpstreamPayloadError();
    }
    return { appId, searchKey };
  }
}

function buildParams(query: SearchArticlesQuery): URLSearchParams {
  const params = new URLSearchParams({
    query: query.q,
    // Forem pagination is 1-based; Algolia's is 0-based.
    page: String(query.page - 1),
    hitsPerPage: String(query.per_page),
    attributesToRetrieve: [
      "objectID",
      "title",
      "path",
      "published_at",
      "readable_publish_date",
      "tag_list",
      "comments_count",
      "public_reactions_count",
      "user",
    ].join(","),
    attributesToHighlight: "",
  });
  if (query.search_fields !== undefined) {
    params.set(
      "restrictSearchableAttributes",
      toAlgoliaFields(query.search_fields),
    );
  }
  return params;
}

function toAlgoliaFields(searchFields: string): string {
  const fields = searchFields
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field !== "");
  const unknown = fields.filter((field) => !(field in SEARCH_FIELDS));
  if (fields.length === 0 || unknown.length > 0) {
    throw new InvalidInputError(
      "search_fields must list title, body_text, or tag_list.",
    );
  }
  return fields.map((field) => SEARCH_FIELDS[field]).join(",");
}

function toArticle(hit: AlgoliaHit): unknown {
  const path = typeof hit.path === "string" ? hit.path : null;
  return {
    id: Number(hit.objectID),
    title: hit.title,
    description: null,
    slug: path?.split("/").pop() ?? null,
    path,
    url: path === null ? null : `${DEVTO_ORIGIN}${path}`,
    published_at:
      typeof hit.published_at === "number"
        ? new Date(hit.published_at * 1000).toISOString()
        : null,
    readable_publish_date: hit.readable_publish_date ?? null,
    tag_list: hit.tag_list ?? [],
    comments_count: hit.comments_count ?? 0,
    public_reactions_count: hit.public_reactions_count ?? 0,
    user: {
      user_id: hit.user?.id ?? null,
      username: hit.user?.username ?? null,
      name: hit.user?.name ?? null,
    },
  };
}
