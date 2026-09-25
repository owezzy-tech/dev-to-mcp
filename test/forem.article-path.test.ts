import { describe, expect, it } from "vitest";
import { ForemApiClient } from "../src/adapters/forem/forem-api-client.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { DiscoveryUseCases } from "../src/core/use-cases/discovery.ts";
import { InvalidInputError } from "../src/errors/api-errors.ts";
import { HttpClient } from "../src/lib/http-client.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function createUseCases(requested: string[]): DiscoveryUseCases {
  const httpClient = new HttpClient({
    logger,
    fetch: async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ id: 7, title: "Article" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return new DiscoveryUseCases(new ForemApiClient(httpClient), logger);
}

describe("get article by path", () => {
  it.each(["ada/my-post-1n45", "/ada/my-post-1n45"])(
    "keeps the username/slug separator for %s",
    async (path) => {
      // Given
      const requested: string[] = [];
      const useCases = createUseCases(requested);

      // When
      await useCases.getArticle({ path }, "corr-path");

      // Then
      expect(requested).toEqual([
        "https://dev.to/api/articles/ada/my-post-1n45",
      ]);
    },
  );

  it("encodes characters inside each segment", async () => {
    // Given
    const requested: string[] = [];
    const useCases = createUseCases(requested);

    // When
    await useCases.getArticle({ path: "ada/a?b#c" }, "corr-path");

    // Then
    expect(requested).toEqual(["https://dev.to/api/articles/ada/a%3Fb%23c"]);
  });

  it.each(["../users/1", "ada/..", "ada", "ada/post/extra", "ada//post", ""])(
    "rejects %j before calling Forem",
    async (path) => {
      // Given
      const requested: string[] = [];
      const useCases = createUseCases(requested);

      // When / Then
      expect(() => useCases.getArticle({ path }, "corr-path")).toThrow(
        InvalidInputError,
      );
      expect(requested).toEqual([]);
    },
  );
});
