import { z } from "zod";

/**
 * Public MCP input schemas.
 *
 * These declarations are the wire contract: they must reproduce exactly the
 * JSON Schema previously emitted by `src/index.ts`, which is guarded by
 * `test/mcp.characterization.test.ts` and `test/fixtures/mcp-tools.ts`.
 * Do not add `.int()`, `.min()`, `.max()`, or `.strict()` constraints here:
 * range validation happens inside the shared use cases so the published schema
 * stays stable.
 */
export const getArticlesInputSchema = {
  username: z.string().optional().describe("Filter articles by username"),
  tag: z.string().optional().describe("Filter articles by tag"),
  top: z
    .number()
    .optional()
    .describe(
      "Number representing the number of days since publication for top articles (1, 7, 30, or infinity)",
    ),
  page: z
    .number()
    .optional()
    .default(1)
    .describe("Pagination page number (default: 1)"),
  per_page: z
    .number()
    .optional()
    .default(30)
    .describe("Number of articles per page (default: 30, max: 1000)"),
  state: z
    .enum(["fresh", "rising", "all"])
    .optional()
    .describe("Filter by article state"),
};

export const getArticleInputSchema = {
  id: z.number().optional().describe("Article ID"),
  path: z
    .string()
    .optional()
    .describe('Article path (e.g., "username/article-slug")'),
};

export const getUserInputSchema = {
  id: z.number().optional().describe("User ID"),
  username: z.string().optional().describe("Username"),
};

export const getTagsInputSchema = {
  page: z
    .number()
    .optional()
    .default(1)
    .describe("Pagination page number (default: 1)"),
  per_page: z
    .number()
    .optional()
    .default(10)
    .describe("Number of tags per page (default: 10, max: 1000)"),
};

export const getCommentsInputSchema = {
  article_id: z.number().describe("Article ID to get comments for"),
};

export const searchArticlesInputSchema = {
  q: z.string().describe("Search query"),
  page: z
    .number()
    .optional()
    .default(1)
    .describe("Pagination page number (default: 1)"),
  per_page: z
    .number()
    .optional()
    .default(30)
    .describe("Number of articles per page (default: 30, max: 1000)"),
  search_fields: z
    .string()
    .optional()
    .describe(
      "Comma-separated list of fields to search (title, body_text, tag_list)",
    ),
};

export const getArticlesSchema = z.object(getArticlesInputSchema);
export const getArticleSchema = z.object(getArticleInputSchema);
export const getUserSchema = z.object(getUserInputSchema);
export const getTagsSchema = z.object(getTagsInputSchema);
export const getCommentsSchema = z.object(getCommentsInputSchema);
export const searchArticlesSchema = z.object(searchArticlesInputSchema);

export type GetArticlesInput = z.infer<typeof getArticlesSchema>;
export type GetArticleInput = z.infer<typeof getArticleSchema>;
export type GetUserInput = z.infer<typeof getUserSchema>;
export type GetTagsInput = z.infer<typeof getTagsSchema>;
export type GetCommentsInput = z.infer<typeof getCommentsSchema>;
export type SearchArticlesInput = z.infer<typeof searchArticlesSchema>;
