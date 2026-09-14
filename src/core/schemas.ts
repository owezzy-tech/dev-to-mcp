import { z } from "zod";
import type { Article, ArticleAuthor, Comment, Tag, User } from "./models.ts";
import { UpstreamPayloadError } from "../errors/api-errors.ts";

/**
 * Tolerant upstream schemas: Forem omits optional fields freely, so absent
 * values are coerced to explicit safe defaults. Unknown upstream keys are
 * stripped (Zod's default object behaviour) so they cannot leak into the
 * stable public models.
 */
const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const nonNegativeNumber = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? 0);

const articleAuthorSchema = z.object({
  user_id: nullableNumber,
  username: nullableString,
  name: nullableString,
});

const tagListSchema = z
  .union([z.array(z.string()), z.string()])
  .nullish()
  .transform((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    return [];
  });

export const articleSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  description: nullableString,
  slug: nullableString,
  path: nullableString,
  url: nullableString,
  published_at: nullableString,
  readable_publish_date: nullableString,
  tag_list: tagListSchema,
  comments_count: nonNegativeNumber,
  public_reactions_count: nonNegativeNumber,
  user: articleAuthorSchema.default({
    user_id: null,
    username: null,
    name: null,
  }),
});

export const userSchema = z.object({
  id: z.number().int().nonnegative(),
  username: nullableString,
  name: nullableString,
  summary: nullableString,
  twitter_username: nullableString,
  github_username: nullableString,
  location: nullableString,
  website_url: nullableString,
  joined_at: nullableString,
});

export const tagSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  bg_color_hex: nullableString,
  text_color_hex: nullableString,
  short_summary: nullableString,
});

type UpstreamAuthorInput = {
  readonly user_id?: number | null;
  readonly username?: string | null;
  readonly name?: string | null;
};

type UpstreamComment = {
  readonly id?: string | number | null;
  readonly id_code?: string | null;
  readonly body_html?: string | null;
  readonly created_at?: string | null;
  readonly user?: UpstreamAuthorInput;
  readonly children?: readonly UpstreamComment[] | null;
};

const upstreamCommentSchema: z.ZodType<UpstreamComment> = z.lazy(() =>
  z.object({
    id: z.union([z.string(), z.number()]).nullish(),
    id_code: z.string().nullish(),
    body_html: z.string().nullish(),
    created_at: z.string().nullish(),
    user: z
      .object({
        user_id: z.number().nullish(),
        username: z.string().nullish(),
        name: z.string().nullish(),
      })
      .optional(),
    children: z.array(upstreamCommentSchema).nullish(),
  }),
);

function parseBoundary<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new UpstreamPayloadError({ cause: error });
    }
    throw error;
  }
}

function toComment(input: UpstreamComment): Comment {
  const id = input.id ?? input.id_code;
  if (id === undefined || id === null) {
    throw new UpstreamPayloadError();
  }
  const user: ArticleAuthor = input.user
    ? {
        user_id: input.user.user_id ?? null,
        username: input.user.username ?? null,
        name: input.user.name ?? null,
      }
    : { user_id: null, username: null, name: null };

  return {
    id,
    body_html: input.body_html ?? "",
    created_at: input.created_at ?? null,
    user,
    children: (input.children ?? []).map(toComment),
  };
}

export function normalizeArticle(payload: unknown): Article {
  return parseBoundary(articleSchema, payload);
}

export function normalizeArticles(payload: unknown): readonly Article[] {
  return parseBoundary(z.array(articleSchema), payload);
}

export function normalizeUser(payload: unknown): User {
  return parseBoundary(userSchema, payload);
}

export function normalizeTag(payload: unknown): Tag {
  return parseBoundary(tagSchema, payload);
}

export function normalizeTags(payload: unknown): readonly Tag[] {
  return parseBoundary(z.array(tagSchema), payload);
}

export function normalizeComment(payload: unknown): Comment {
  return toComment(parseBoundary(upstreamCommentSchema, payload));
}

export function normalizeComments(payload: unknown): readonly Comment[] {
  return parseBoundary(z.array(upstreamCommentSchema), payload).map(toComment);
}
