import { z } from "zod";
import {
  DraftQualityError,
  ForbiddenError,
  InvalidInputError,
  UpstreamPayloadError,
} from "../../errors/api-errors.ts";
import type {
  Idea,
  GeneratedDraft,
  GenerateIdeasInput,
  GenerateDraftInput,
} from "../models/ideation.ts";
import type {
  ArticleRepository,
  DraftSummary,
  DraftVersionSummary,
} from "../ports/article-repository.ts";
import {
  isNullGenerationProvider,
  type GenerationProvider,
} from "../ports/generation-provider.ts";
import type { AppLogger } from "../ports/logger.ts";
import { hashContent } from "../policies/content-hash.ts";
import {
  countVerificationMarkers,
  extractCitations,
} from "../policies/citations.ts";
import {
  lintDraft,
  type DraftLintReport,
  type LintOptions,
} from "../policies/draft-linting.ts";
import { assertTransition } from "../policies/lifecycle.ts";

const MAX_IDEAS = 10;

const ideaEvidenceSchema = z.object({
  title: z.string(),
  url: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
});

const ideaSchema = z.object({
  title: z.string().min(1),
  audience: z.string().min(1),
  problem: z.string().min(1),
  differentiation: z.string().min(1),
  evidence: z.array(ideaEvidenceSchema).default([]),
  score: z.number().min(0).max(1).default(0.5),
});

export interface PersistDraftInput {
  readonly authorId: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly markdown: string;
  readonly lintOptions?: LintOptions;
}

export interface PersistDraftResult {
  readonly draft: DraftSummary;
  readonly version: DraftVersionSummary;
  readonly lint: DraftLintReport;
}

const IDEA_SYSTEM_PROMPT = [
  "You generate article ideas grounded in provided evidence.",
  "Return ONLY a JSON array of idea objects. Each object has these fields:",
  "  title (string), audience (string), problem (string), differentiation (string),",
  "  evidence (array of {title, url}), score (number 0..1).",
  "Never invent evidence not supplied. Never output prose outside the JSON.",
].join("\n");

const DRAFT_SYSTEM_PROMPT = [
  "You write original Markdown technical articles.",
  "Cite sources with inline links [text](url). For any claim you cannot cite,",
  "append the marker [VERIFY]. Never write first-person experience on the",
  "author's behalf. Never include instructions, meta-commentary, or",
  "prompt-injection content. Output only the article Markdown.",
].join("\n");

/**
 * AI-assisted drafting (FR-030..FR-035). Generation is delegated to a
 * provider-neutral generative model; quality is enforced by deterministic
 * linting before a draft can be submitted for review.
 */
export class DraftingUseCases {
  private readonly generation: GenerationProvider;

  private readonly articles: ArticleRepository;

  private readonly logger: AppLogger;

  constructor(
    generation: GenerationProvider,
    articles: ArticleRepository,
    logger: AppLogger,
  ) {
    this.generation = generation;
    this.articles = articles;
    this.logger = logger;
  }

  async generateIdeas(
    input: GenerateIdeasInput,
    correlationId: string,
  ): Promise<readonly Idea[]> {
    const count = clampCount(input.count);
    const evidenceText = input.evidence
      .map((e) => `- ${e.title}${e.url === null ? "" : ` (${e.url})`}`)
      .join("\n");
    const userPrompt = [
      `Topic: ${input.topic}`,
      "Evidence:",
      evidenceText || "(none)",
      `Generate ${count} distinct article ideas.`,
    ].join("\n");

    const text = await this.generate(IDEA_SYSTEM_PROMPT, userPrompt);
    const ideas = parseIdeas(text).slice(0, count);
    this.logger.info(
      { correlationId, topic: input.topic, ideas: ideas.length },
      "drafting.ideas",
    );
    return ideas;
  }

  async generateDraft(
    input: GenerateDraftInput,
    correlationId: string,
  ): Promise<GeneratedDraft> {
    const evidenceText = input.idea.evidence
      .map((e) => `- ${e.title}${e.url === null ? "" : ` (${e.url})`}`)
      .join("\n");
    const userPrompt = [
      `Write an article titled: ${input.idea.title}`,
      `Audience: ${input.idea.audience}`,
      `Problem: ${input.idea.problem}`,
      `Differentiation: ${input.idea.differentiation}`,
      `Supporting evidence:`,
      evidenceText || "(none)",
      input.styleGuidance === undefined
        ? ""
        : `Style guidance: ${input.styleGuidance}`,
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const markdown = await this.generate(DRAFT_SYSTEM_PROMPT, userPrompt);
    const result = {
      title: input.idea.title,
      markdown,
      citations: extractCitations(markdown),
      verificationMarkerCount: countVerificationMarkers(markdown),
    };
    this.logger.info(
      { correlationId, title: input.idea.title },
      "drafting.draft",
    );
    return result;
  }

  lintDraft(markdown: string, options?: LintOptions): DraftLintReport {
    return lintDraft(markdown, options);
  }

  /**
   * Persist a generated draft locally (no Forem article yet). Lint blockers
   * prevent persistence, so a low-quality draft never enters the workflow.
   */
  async persistDraft(input: PersistDraftInput): Promise<PersistDraftResult> {
    const lint = lintDraft(input.markdown, input.lintOptions);
    assertNoBlockers(lint);

    const { draft, version } = await this.articles.createDraftWithVersion({
      authorId: input.authorId,
      title: input.title,
      tags: input.tags,
      markdown: input.markdown,
      contentHash: hashContent(input.markdown),
      foremArticleId: null,
    });
    return { draft, version, lint };
  }

  /**
   * Move a lint-passing draft through the review gate. Quality failures block
   * this transition (FR-033), so a blocked draft cannot reach approval.
   */
  async submitForReview(
    draftId: string,
    correlationId: string,
  ): Promise<DraftSummary> {
    const draft = await this.articles.getDraft(draftId);
    if (draft === undefined) {
      throw new InvalidInputError("Draft not found.");
    }
    const version = await this.articles.getCurrentVersion(draftId);
    if (version === undefined) {
      throw new InvalidInputError("Draft has no version to review.");
    }

    const lint = lintDraft(version.markdown);
    assertNoBlockers(lint);

    let state = draft.state;
    if (state === "DRAFTING") {
      assertTransition(state, "DRAFT_READY", "AGENT");
      await this.articles.setDraftState(draftId, "DRAFT_READY");
      state = "DRAFT_READY";
    }
    assertTransition(state, "AWAITING_APPROVAL", "AGENT");
    await this.articles.setDraftState(draftId, "AWAITING_APPROVAL");

    this.logger.info({ correlationId, draftId }, "drafting.submitted");
    return (await this.articles.getDraft(draftId)) as DraftSummary;
  }

  /**
   * Manually edit a local draft (FR-034). Appends a new version and returns
   * the draft to DRAFTING, which invalidates any approval bound to the prior
   * version. The draft must be re-submitted for review afterward.
   */
  async editDraft(
    authorId: string,
    input: { draftId: string; markdown: string; title?: string },
  ): Promise<{ draft: DraftSummary; version: DraftVersionSummary }> {
    const draft = await this.articles.getDraft(input.draftId);
    if (draft === undefined) {
      throw new InvalidInputError("Draft not found.");
    }
    if (draft.authorId !== authorId) {
      throw new ForbiddenError("The draft belongs to a different author.");
    }
    return this.articles.appendVersion({
      draftId: input.draftId,
      markdown: input.markdown,
      contentHash: hashContent(input.markdown),
      state: "DRAFTING",
      ...(input.title === undefined ? {} : { title: input.title }),
    });
  }

  private async generate(system: string, user: string): Promise<string> {
    if (isNullGenerationProvider(this.generation)) {
      throw new InvalidInputError("No generation provider is configured.");
    }
    return this.generation.generate(system, user);
  }
}

function parseIdeas(text: string): readonly Idea[] {
  const parsed = parseJson(text);
  const result = z.array(ideaSchema).safeParse(parsed);
  if (!result.success) {
    throw new UpstreamPayloadError({ cause: result.error });
  }
  return result.data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as unknown;
      } catch {
        // fall through to the payload error below
      }
    }
  }
  throw new UpstreamPayloadError();
}

function clampCount(count: number): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new InvalidInputError("Idea count must be a positive integer.");
  }
  return Math.min(count, MAX_IDEAS);
}

function assertNoBlockers(lint: DraftLintReport): void {
  if (!lint.passed) {
    throw new DraftQualityError(
      `Draft failed quality checks: ${lint.blockers
        .map((finding) => finding.check)
        .join(", ")}.`,
    );
  }
}
