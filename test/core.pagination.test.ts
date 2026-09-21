import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePagination } from "../src/core/policies/pagination.ts";
import { InvalidInputError } from "../src/errors/api-errors.ts";
import {
  getArticlesInputSchema,
  getTagsInputSchema,
  searchArticlesInputSchema,
} from "../src/mcp/tool-schemas.ts";

describe("pagination policy", () => {
  it("accepts inclusive pagination boundaries", () => {
    // Given
    const lowerBoundary = { page: 1, per_page: 1 };
    const upperBoundary = { page: 100, per_page: 1000 };

    // When
    const lower = parsePagination(lowerBoundary);
    const upper = parsePagination(upperBoundary);

    // Then
    expect(lower).toEqual(lowerBoundary);
    expect(upper).toEqual(upperBoundary);
  });

  it.each([
    { page: 0, per_page: 30 },
    { page: -1, per_page: 30 },
    { page: 1.5, per_page: 30 },
    { page: Number.NaN, per_page: 30 },
    { page: Number.POSITIVE_INFINITY, per_page: 30 },
    { page: 101, per_page: 30 },
    { page: 1, per_page: 0 },
    { page: 1, per_page: -1 },
    { page: 1, per_page: 1.5 },
    { page: 1, per_page: Number.NaN },
    { page: 1, per_page: Number.POSITIVE_INFINITY },
    { page: 1, per_page: 1001 },
  ])("rejects invalid pagination %#", (pagination) => {
    // Given / When
    const parse = () => parsePagination(pagination);

    // Then
    expect(parse).toThrow(InvalidInputError);
  });

  it("preserves public schema defaults before policy validation", () => {
    // Given
    const articleSchema = z.object(getArticlesInputSchema);
    const tagSchema = z.object(getTagsInputSchema);
    const searchSchema = z.object(searchArticlesInputSchema);

    // When
    const articles = articleSchema.parse({});
    const tags = tagSchema.parse({});
    const search = searchSchema.parse({ q: "mcp" });

    // Then
    expect(articles).toMatchObject({ page: 1, per_page: 30 });
    expect(tags).toEqual({ page: 1, per_page: 10 });
    expect(search).toEqual({ q: "mcp", page: 1, per_page: 30 });
  });
});
