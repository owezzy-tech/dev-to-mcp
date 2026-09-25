import { describe, expect, it } from "vitest";
import { ForemApiClient } from "../src/adapters/forem/forem-api-client.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import {
  InvalidInputError,
  UpstreamPayloadError,
} from "../src/errors/api-errors.ts";
import { HttpClient } from "../src/lib/http-client.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const context = { correlationId: "corr-search" };

const searchPage = (key: string): string =>
  `<div id="search" data-algolia-id="APP1" data-algolia-search-key="${key}"></div>`;

const hit = {
  objectID: "4718508",
  title: "TypeScript Generic Defaults",
  path: "/jsmanifest/typescript-generic-defaults-5gb7",
  published_at: 1790188480,
  readable_publish_date: "Sep 23",
  tag_list: ["typescript", "react"],
  comments_count: 2,
  public_reactions_count: 5,
  user: { id: 171901, username: "jsmanifest", name: "JS Manifest" },
};

type Call = { url: URL; headers: Record<string, string> };

function createClient(options: {
  pages: string[];
  algoliaStatuses?: number[];
}): { client: ForemApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const pages = [...options.pages];
  const statuses = [...(options.algoliaStatuses ?? [])];
  const httpClient = new HttpClient({
    logger,
    sleep: async () => undefined,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, headers: init?.headers as Record<string, string> });
      if (url.hostname === "dev.to") {
        return new Response(pages.shift() ?? "", { status: 200 });
      }
      const status = statuses.shift() ?? 200;
      return new Response(JSON.stringify({ hits: [hit] }), { status });
    },
  });
  return { client: new ForemApiClient(httpClient), calls };
}

describe("article search via dev.to Algolia", () => {
  it("queries the article index with the scraped key and maps hits", async () => {
    // Given
    const { client, calls } = createClient({ pages: [searchPage("KEY1")] });

    // When
    const articles = await client.searchArticles(
      {
        q: "typescript",
        page: 2,
        per_page: 5,
        search_fields: "title,body_text",
      },
      context,
    );

    // Then
    const query = calls[1];
    expect(query?.url.origin + query?.url.pathname).toBe(
      "https://app1-dsn.algolia.net/1/indexes/Article_production",
    );
    expect(query?.url.searchParams.get("query")).toBe("typescript");
    expect(query?.url.searchParams.get("page")).toBe("1");
    expect(query?.url.searchParams.get("hitsPerPage")).toBe("5");
    expect(query?.url.searchParams.get("restrictSearchableAttributes")).toBe(
      "title,body",
    );
    expect(query?.headers).toMatchObject({
      "x-algolia-application-id": "APP1",
      "x-algolia-api-key": "KEY1",
    });
    expect(articles).toEqual([
      {
        id: 4718508,
        title: "TypeScript Generic Defaults",
        description: null,
        slug: "typescript-generic-defaults-5gb7",
        path: "/jsmanifest/typescript-generic-defaults-5gb7",
        url: "https://dev.to/jsmanifest/typescript-generic-defaults-5gb7",
        published_at: "2026-09-23T18:34:40.000Z",
        readable_publish_date: "Sep 23",
        tag_list: ["typescript", "react"],
        comments_count: 2,
        public_reactions_count: 5,
        user: { user_id: 171901, username: "jsmanifest", name: "JS Manifest" },
      },
    ]);
  });

  it("reuses the key across searches", async () => {
    // Given
    const { client, calls } = createClient({ pages: [searchPage("KEY1")] });
    const query = { q: "a", page: 1, per_page: 1 };

    // When
    await client.searchArticles(query, context);
    await client.searchArticles(query, context);

    // Then
    expect(calls.filter((c) => c.url.hostname === "dev.to")).toHaveLength(1);
  });

  it("re-reads a rotated key once when Algolia rejects it", async () => {
    // Given
    const { client, calls } = createClient({
      pages: [searchPage("OLD"), searchPage("NEW")],
      algoliaStatuses: [403, 200],
    });

    // When
    const articles = await client.searchArticles(
      { q: "a", page: 1, per_page: 1 },
      context,
    );

    // Then
    expect(articles).toHaveLength(1);
    expect(calls.at(-1)?.headers["x-algolia-api-key"]).toBe("NEW");
  });

  it("rejects unknown search fields before calling upstream", async () => {
    // Given
    const { client, calls } = createClient({ pages: [searchPage("KEY1")] });

    // When / Then
    await expect(
      client.searchArticles(
        { q: "a", page: 1, per_page: 1, search_fields: "title,author" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toEqual([]);
  });

  it("fails as an upstream payload error when the key is missing", async () => {
    // Given
    const { client } = createClient({ pages: ["<html></html>"] });

    // When / Then
    await expect(
      client.searchArticles({ q: "a", page: 1, per_page: 1 }, context),
    ).rejects.toBeInstanceOf(UpstreamPayloadError);
  });
});
