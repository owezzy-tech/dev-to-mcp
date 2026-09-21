export type ArticleAuthor = {
  readonly user_id: number | null;
  readonly username: string | null;
  readonly name: string | null;
};

export type Article = {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly slug: string | null;
  readonly path: string | null;
  readonly url: string | null;
  readonly published_at: string | null;
  readonly readable_publish_date: string | null;
  readonly tag_list: readonly string[];
  readonly comments_count: number;
  readonly public_reactions_count: number;
  readonly user: ArticleAuthor;
};

export type User = {
  readonly id: number;
  readonly username: string | null;
  readonly name: string | null;
  readonly summary: string | null;
  readonly twitter_username: string | null;
  readonly github_username: string | null;
  readonly location: string | null;
  readonly website_url: string | null;
  readonly joined_at: string | null;
};

export type Tag = {
  readonly id: number;
  readonly name: string;
  readonly bg_color_hex: string | null;
  readonly text_color_hex: string | null;
  readonly short_summary: string | null;
};

export type Comment = {
  readonly id: string | number;
  readonly body_html: string;
  readonly created_at: string | null;
  readonly user: ArticleAuthor;
  readonly children: readonly Comment[];
};
