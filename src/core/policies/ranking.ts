import type {
  ScoredSnapshot,
  SnapshotRecord,
} from "../ports/retrieval-repository.ts";

/** Weights for the composite rank. They must sum to 1. */
export interface RankingWeights {
  readonly semantic: number;
  readonly recency: number;
  readonly engagement: number;
  readonly topic: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 0.4,
  recency: 0.2,
  engagement: 0.2,
  topic: 0.2,
};

export interface RankedResult {
  readonly snapshot: SnapshotRecord;
  readonly score: number;
  readonly components: {
    readonly semantic: number;
    readonly recency: number;
    readonly engagement: number;
    readonly topic: number;
  };
}

export interface RankingOptions {
  readonly weights?: RankingWeights;
  readonly configuredTopics?: readonly string[];
  readonly now?: Date;
}

const RECENCY_HALF_LIFE_DAYS = 180;

/** Exponential recency decay: 1 for just-published, decaying to 0 over time. */
export function recencyScore(publishedAt: Date | null, now: Date): number {
  if (publishedAt === null) {
    return 0.5;
  }
  const ageDays = (now.getTime() - publishedAt.getTime()) / 86_400_000;
  if (ageDays < 0) {
    return 1;
  }
  return 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS);
}

/** Log-scaled engagement from reactions and comments, saturating at 1. */
export function engagementScore(comments: number, reactions: number): number {
  const raw =
    Math.log1p(Math.max(0, comments)) + Math.log1p(Math.max(0, reactions));
  return Math.min(raw / Math.log1p(1_000), 1);
}

/** 0..1 overlap between a snapshot's tags and configured topics. */
export function topicRelevance(
  tags: readonly string[],
  configuredTopics: readonly string[],
): number {
  if (configuredTopics.length === 0) {
    return 0.5;
  }
  if (tags.length === 0) {
    return 0;
  }
  const wanted = new Set(configuredTopics.map((t) => t.toLowerCase()));
  const matched = tags.filter((t) => wanted.has(t.toLowerCase())).length;
  return Math.min(matched / configuredTopics.length, 1);
}

/**
 * Normalize a set of raw scores into 0..1 by their range. When all scores are
 * equal, return 0.5 for each to avoid dividing by zero.
 */
export function normalize(scores: readonly number[]): readonly number[] {
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  if (max === min) {
    return scores.map(() => 0.5);
  }
  return scores.map((score) => (score - min) / (max - min));
}

/**
 * Merge full-text and vector hits into one ranked list. Vector similarity is
 * the primary semantic signal; when a snapshot has no vector, its normalized
 * text rank is used instead. Snapshots present in both keep the stronger
 * signal. Pure: returns a new list, sorted descending by composite score.
 */
export function rankHybrid(
  textHits: readonly ScoredSnapshot[],
  vectorHits: readonly ScoredSnapshot[],
  options: RankingOptions = {},
): readonly RankedResult[] {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const topics = options.configuredTopics ?? [];
  const now = options.now ?? new Date();

  const normalizedText = normalize(textHits.map((hit) => hit.score));

  const semantic = new Map<string, number>();
  const snapshot = new Map<string, SnapshotRecord>();

  textHits.forEach((hit, index) => {
    const textScore = normalizedText[index] ?? 0;
    semantic.set(
      hit.snapshot.id,
      Math.max(semantic.get(hit.snapshot.id) ?? 0, textScore),
    );
    snapshot.set(hit.snapshot.id, hit.snapshot);
  });
  vectorHits.forEach((hit) => {
    semantic.set(
      hit.snapshot.id,
      Math.max(semantic.get(hit.snapshot.id) ?? 0, hit.score),
    );
    snapshot.set(hit.snapshot.id, hit.snapshot);
  });

  return [...snapshot.values()]
    .map((record) => {
      const components = {
        semantic: semantic.get(record.id) ?? 0,
        recency: recencyScore(record.publishedAt, now),
        engagement: engagementScore(
          record.commentsCount,
          record.publicReactionsCount,
        ),
        topic: topicRelevance(record.tagList, topics),
      };
      const score =
        components.semantic * weights.semantic +
        components.recency * weights.recency +
        components.engagement * weights.engagement +
        components.topic * weights.topic;
      return { snapshot: record, score, components };
    })
    .sort((a, b) => b.score - a.score);
}

/** Bound a ranked list to `limit` results. */
export function bound<T>(results: readonly T[], limit: number): readonly T[] {
  return results.slice(0, Math.max(0, limit));
}
