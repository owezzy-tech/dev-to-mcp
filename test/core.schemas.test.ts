import { describe, expect, it } from "vitest";
import {
  normalizeArticle,
  normalizeComment,
  normalizeTag,
  normalizeUser,
} from "../src/core/schemas.ts";
import { UpstreamPayloadError } from "../src/errors/api-errors.ts";

describe("upstream schema normalization", () => {
  it("normalizes an article to the stable public shape", () => {
    // Given
    const upstream = {
      id: 42,
      title: "Typed boundaries",
      description: "A practical guide",
      slug: "typed-boundaries",
      path: "/ada/typed-boundaries",
      url: "https://dev.to/ada/typed-boundaries",
      published_at: "2026-09-15T12:00:00Z",
      readable_publish_date: "Sep 15",
      tag_list: ["typescript", "mcp"],
      comments_count: 3,
      public_reactions_count: 9,
      user: { user_id: 7, username: "ada", name: "Ada" },
      private_token: "must-not-leak",
    };

    // When
    const article = normalizeArticle(upstream);

    // Then
    expect(article).toEqual({
      id: 42,
      title: "Typed boundaries",
      description: "A practical guide",
      slug: "typed-boundaries",
      path: "/ada/typed-boundaries",
      url: "https://dev.to/ada/typed-boundaries",
      published_at: "2026-09-15T12:00:00Z",
      readable_publish_date: "Sep 15",
      tag_list: ["typescript", "mcp"],
      comments_count: 3,
      public_reactions_count: 9,
      user: { user_id: 7, username: "ada", name: "Ada" },
    });
  });

  it("reads negative Forem counts as zero", () => {
    // Given
    const upstream = {
      id: 42,
      title: "Hidden comments",
      comments_count: -1,
      public_reactions_count: -1,
    };

    // When
    const article = normalizeArticle(upstream);

    // Then
    expect(article.comments_count).toBe(0);
    expect(article.public_reactions_count).toBe(0);
  });

  it("fills missing optional article fields with safe values", () => {
    // Given
    const upstream = { id: 42, title: "Minimal article" };

    // When
    const article = normalizeArticle(upstream);

    // Then
    expect(article).toEqual({
      id: 42,
      title: "Minimal article",
      description: null,
      slug: null,
      path: null,
      url: null,
      published_at: null,
      readable_publish_date: null,
      tag_list: [],
      comments_count: 0,
      public_reactions_count: 0,
      user: { user_id: null, username: null, name: null },
    });
  });

  it("normalizes users and tags without leaking unknown fields", () => {
    // Given
    const upstreamUser = {
      id: 7,
      username: "ada",
      name: "Ada",
      summary: "Writes software",
      twitter_username: null,
      github_username: "ada",
      location: "London",
      website_url: "https://example.test",
      joined_at: "Sep 1, 2020",
      api_key: "must-not-leak",
    };
    const upstreamTag = {
      id: 5,
      name: "mcp",
      bg_color_hex: "#000000",
      text_color_hex: "#ffffff",
      short_summary: "Model Context Protocol",
      internal_score: 999,
    };

    // When
    const user = normalizeUser(upstreamUser);
    const tag = normalizeTag(upstreamTag);

    // Then
    expect(user).toEqual({
      id: 7,
      username: "ada",
      name: "Ada",
      summary: "Writes software",
      twitter_username: null,
      github_username: "ada",
      location: "London",
      website_url: "https://example.test",
      joined_at: "Sep 1, 2020",
    });
    expect(tag).toEqual({
      id: 5,
      name: "mcp",
      bg_color_hex: "#000000",
      text_color_hex: "#ffffff",
      short_summary: "Model Context Protocol",
    });
  });

  it("normalizes recursive comments and missing optional fields", () => {
    // Given
    const upstream = {
      id_code: "abc1",
      body_html: "<p>Parent</p>",
      created_at: "2026-09-15T12:00:00Z",
      user: { user_id: 7, username: "ada", name: "Ada" },
      children: [{ id: 2, body_html: "<p>Child</p>" }],
      raw_body: "must-not-leak",
    };

    // When
    const comment = normalizeComment(upstream);

    // Then
    expect(comment).toEqual({
      id: "abc1",
      body_html: "<p>Parent</p>",
      created_at: "2026-09-15T12:00:00Z",
      user: { user_id: 7, username: "ada", name: "Ada" },
      children: [
        {
          id: 2,
          body_html: "<p>Child</p>",
          created_at: null,
          user: { user_id: null, username: null, name: null },
          children: [],
        },
      ],
    });
  });

  it("rejects malformed upstream payloads with a typed error", () => {
    // Given
    const malformed = { id: "not-a-number", title: "Broken" };

    // When
    const normalize = () => normalizeArticle(malformed);

    // Then
    expect(normalize).toThrow(UpstreamPayloadError);
  });
});
