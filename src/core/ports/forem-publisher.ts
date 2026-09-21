import type { ForemRequestContext } from "./forem-client.ts";

export type ForemArticleState = "published" | "unpublished" | "all";

export interface ForemArticleRecord {
  readonly id: number;
  readonly title: string;
  readonly url: string;
  readonly published: boolean;
  readonly publishedAt: string | null;
}

export interface DraftArticleInput {
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly tags: readonly string[];
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly coverImage?: string;
}

export interface UpdateDraftArticleInput {
  readonly id: number;
  readonly title?: string;
  readonly bodyMarkdown?: string;
  readonly tags?: readonly string[];
  readonly description?: string;
}

export interface ForemPublisher {
  listMyArticles(
    input: { readonly state: ForemArticleState },
    context: ForemRequestContext,
  ): Promise<readonly ForemArticleRecord[]>;
  createArticleDraft(
    input: DraftArticleInput,
    context: ForemRequestContext,
  ): Promise<ForemArticleRecord>;
  updateArticleDraft(
    input: UpdateDraftArticleInput,
    context: ForemRequestContext,
  ): Promise<ForemArticleRecord>;
  publishArticle(
    input: { readonly id: number },
    context: ForemRequestContext,
  ): Promise<ForemArticleRecord>;
}
