import { InvalidInputError } from "../../errors/api-errors.ts";
import type { Article } from "../models.ts";
import type { AppLogger } from "../ports/logger.ts";
import {
  isNullEmbeddingProvider,
  type EmbeddingProvider,
} from "../ports/embedding-provider.ts";
import type {
  CandidateTopic,
  GapAnalysis,
  JudgmentProvider,
  PriorArticleSummary,
  SafetyJudgment,
} from "../ports/judgment-provider.ts";
import type {
  ArticleSnapshotInput,
  RetrievalRepository,
  ScoredSnapshot,
} from "../ports/retrieval-repository.ts";
import { boundGapAnalysis } from "../policies/gap-analysis.ts";
import {
  bestDeterministicMatch,
  DUPLICATION_THRESHOLD,
} from "../policies/duplication.ts";
import { bound, rankHybrid, type RankedResult } from "../policies/ranking.ts";
import { untrusted } from "../policies/untrusted-content.ts";
import type { UntrustedText } from "../policies/untrusted-content.ts";

export const MAX_SEARCH_LIMIT = 100;
export const DEFAULT_SEARCH_LIMIT = 20;

export interface SearchOptions {
  readonly limit?: number;
  readonly configuredTopics?: readonly string[];
}

export interface IngestOutcome {
  readonly ingested: number;
  readonly embedded: number;
}

export interface DuplicationReport {
  readonly duplicate: boolean;
  readonly similarity: number;
  readonly matchedTitle: string | null;
  readonly rationale: string | null;
}

/** Map a normalized Forem article into durable snapshot input. */
export function toSnapshotInput(
  article: Article,
  authorId?: string,
): ArticleSnapshotInput {
  return {
    foremArticleId: article.id,
    title: article.title,
    description: article.description,
    tagList: article.tag_list,
    commentsCount: article.comments_count,
    publicReactionsCount: article.public_reactions_count,
    publishedAt:
      article.published_at === null ? null : new Date(article.published_at),
    authorUsername: article.user?.username ?? null,
    ...(authorId === undefined ? {} : { authorId }),
  };
}

/**
 * Hybrid retrieval and content-gap intelligence (FR-010..FR-014).
 *
 * Retrieved content is always treated as untrusted data: it is never
 * evaluated as instructions and never flows into a tool-invoking path. The
 * use case only composes typed results from deterministic policies and the
 * judgment provider.
 */
export class RetrievalUseCases {
  private readonly repository: RetrievalRepository;

  private readonly embeddings: EmbeddingProvider;

  private readonly judgments: JudgmentProvider;

  private readonly logger: AppLogger;

  constructor(
    repository: RetrievalRepository,
    embeddings: EmbeddingProvider,
    judgments: JudgmentProvider,
    logger: AppLogger,
  ) {
    this.repository = repository;
    this.embeddings = embeddings;
    this.judgments = judgments;
    this.logger = logger;
  }

  async ingest(
    articles: readonly ArticleSnapshotInput[],
    correlationId: string,
  ): Promise<IngestOutcome> {
    let embedded = 0;
    const toEmbed: { snapshotId: string; text: string }[] = [];

    for (const article of articles) {
      const snapshot = await this.repository.upsertSnapshot(article);
      const text = `${article.title}\n${article.description ?? ""}`.trim();
      if (text.length > 0 && !isNullEmbeddingProvider(this.embeddings)) {
        toEmbed.push({ snapshotId: snapshot.id, text });
      }
    }

    if (toEmbed.length > 0) {
      const vectors = await this.embeddings.embed(toEmbed.map((e) => e.text));
      for (let i = 0; i < toEmbed.length; i += 1) {
        const vector = vectors[i];
        const entry = toEmbed[i];
        if (
          vector === undefined ||
          entry === undefined ||
          vector.length === 0
        ) {
          continue;
        }
        await this.repository.storeEmbedding({
          snapshotId: entry.snapshotId,
          vector,
          model: this.embeddings.model,
          dimensions: this.embeddings.dimensions,
        });
        embedded += 1;
      }
    }

    this.logger.info(
      { correlationId, ingested: articles.length, embedded },
      "retrieval.ingest",
    );
    return { ingested: articles.length, embedded };
  }

  async hybridSearch(
    query: string,
    options: SearchOptions,
    correlationId: string,
  ): Promise<readonly RankedResult[]> {
    const normalized = query.trim();
    if (normalized.length === 0) {
      throw new InvalidInputError("Search query must not be empty.");
    }
    const limit = clampLimit(options.limit);

    const textHits = await this.repository.searchByText(normalized, limit);

    const hasEmbeddings =
      !isNullEmbeddingProvider(this.embeddings) &&
      (await this.repository.hasEmbeddings());
    const vectorHits = hasEmbeddings
      ? await this.embedAndSearch(normalized, limit)
      : [];

    const ranked = rankHybrid(textHits, vectorHits, {
      configuredTopics: options.configuredTopics,
    });

    this.logger.debug(
      {
        correlationId,
        query: normalized,
        textHits: textHits.length,
        vectorHits: vectorHits.length,
      },
      "retrieval.search",
    );
    return bound(ranked, limit);
  }

  async detectDuplication(
    candidate: CandidateTopic,
    authorId: string,
    correlationId: string,
  ): Promise<DuplicationReport> {
    const priors = await this.priorArticles(authorId);
    const judgment = await this.judgments.detectDuplication(candidate, priors);
    const deterministic = bestDeterministicMatch(candidate, priors);

    const similarity = Math.max(judgment.similarity, deterministic.similarity);
    const duplicate = similarity >= DUPLICATION_THRESHOLD;

    this.logger.debug(
      { correlationId, authorId, similarity, duplicate },
      "retrieval.duplication",
    );
    return {
      duplicate,
      similarity,
      matchedTitle: duplicate ? deterministic.matchedTitle : null,
      rationale: judgment.rationale,
    };
  }

  async analyzeContentGap(
    query: string,
    correlationId: string,
  ): Promise<GapAnalysis> {
    const normalized = query.trim();
    if (normalized.length === 0) {
      throw new InvalidInputError("Gap query must not be empty.");
    }
    const evidenceHits = await this.repository.searchByText(
      normalized,
      MAX_SEARCH_LIMIT,
    );
    const evidence = evidenceHits.map((hit) => hit.snapshot);

    const analysis = await this.judgments.analyzeGap(
      normalized,
      evidence.map((record) => ({
        title: record.title,
        description: record.description,
      })),
    );

    const result = boundGapAnalysis(analysis, evidence, normalized);
    this.logger.debug(
      { correlationId, query: normalized, evidence: evidence.length },
      "retrieval.gap",
    );
    return result;
  }

  /** Assess whether retrieved content is hostile; never act on it here. */
  async assessContentSafety(content: string): Promise<SafetyJudgment> {
    return this.judgments.assessSafety(content);
  }

  /** Wrap retrieved text as untrusted so it cannot be treated as instructions. */
  markUntrusted(text: string): UntrustedText {
    return untrusted(text);
  }

  private async embedAndSearch(
    query: string,
    limit: number,
  ): Promise<readonly ScoredSnapshot[]> {
    const vectors = await this.embeddings.embed([query]);
    const vector = vectors[0];
    if (vector === undefined || vector.length === 0) {
      return [];
    }
    return this.repository.searchByVector(vector, limit);
  }

  private async priorArticles(
    authorId: string,
  ): Promise<readonly PriorArticleSummary[]> {
    const records = await this.repository.listSnapshotsByAuthor(authorId);
    return records.map((record) => ({
      title: record.title,
      tags: record.tagList,
      description: record.description,
    }));
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidInputError("Search limit must be a positive integer.");
  }
  return Math.min(limit, MAX_SEARCH_LIMIT);
}
