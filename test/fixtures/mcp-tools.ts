const jsonSchema = "http://json-schema.org/draft-07/schema#";
const annotations = { readOnlyHint: true, openWorldHint: true };
const execution = { taskSupport: "forbidden" };
const page = {
  type: "number",
  default: 1,
  description: "Pagination page number (default: 1)",
};
const articlesPerPage = {
  type: "number",
  default: 30,
  description: "Number of articles per page (default: 30, max: 1000)",
};

function inputSchema(
  properties: Record<string, object>,
  required?: string[],
): object {
  return {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    additionalProperties: false,
    $schema: jsonSchema,
  };
}

export const expectedTools = [
  {
    name: "get_articles",
    title: "Get Articles",
    description:
      "Get articles from dev.to. Can filter by username, tag, or other parameters.",
    inputSchema: inputSchema({
      username: { type: "string", description: "Filter articles by username" },
      tag: { type: "string", description: "Filter articles by tag" },
      top: {
        type: "number",
        description:
          "Number representing the number of days since publication for top articles (1, 7, 30, or infinity)",
      },
      page,
      per_page: articlesPerPage,
      state: {
        type: "string",
        enum: ["fresh", "rising", "all"],
        description: "Filter by article state",
      },
    }),
    annotations,
    execution,
  },
  {
    name: "get_article",
    title: "Get Article",
    description: "Get a specific article by ID or path",
    inputSchema: inputSchema({
      id: { type: "number", description: "Article ID" },
      path: {
        type: "string",
        description: 'Article path (e.g., "username/article-slug")',
      },
    }),
    annotations,
    execution,
  },
  {
    name: "get_user",
    title: "Get User",
    description: "Get user information by ID or username",
    inputSchema: inputSchema({
      id: { type: "number", description: "User ID" },
      username: { type: "string", description: "Username" },
    }),
    annotations,
    execution,
  },
  {
    name: "get_tags",
    title: "Get Tags",
    description: "Get popular tags from dev.to",
    inputSchema: inputSchema({
      page,
      per_page: {
        type: "number",
        default: 10,
        description: "Number of tags per page (default: 10, max: 1000)",
      },
    }),
    annotations,
    execution,
  },
  {
    name: "get_comments",
    title: "Get Comments",
    description: "Get comments for a specific article",
    inputSchema: inputSchema(
      {
        article_id: {
          type: "number",
          description: "Article ID to get comments for",
        },
      },
      ["article_id"],
    ),
    annotations,
    execution,
  },
  {
    name: "search_articles",
    title: "Search Articles",
    description: "Search articles using query parameters",
    inputSchema: inputSchema(
      {
        q: { type: "string", description: "Search query" },
        page,
        per_page: articlesPerPage,
        search_fields: {
          type: "string",
          description:
            "Comma-separated list of fields to search (title, body_text, tag_list)",
        },
      },
      ["q"],
    ),
    annotations,
    execution,
  },
] as const;
