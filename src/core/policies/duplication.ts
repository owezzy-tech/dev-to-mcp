import type {
  CandidateTopic,
  PriorArticleSummary,
} from "../ports/judgment-provider.ts";

/** Similarity at or above this value flags a candidate as a likely duplicate. */
export const DUPLICATION_THRESHOLD = 0.6;

/** Jaccard similarity over normalized, tokenized text. */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 && tokensB.size === 0) {
    return 0;
  }
  const intersection = [...tokensA].filter((token) =>
    tokensB.has(token),
  ).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

/**
 * Deterministic overlap between a candidate and one prior article, used as a
 * fallback when no judgment provider is configured. Combines title token
 * similarity and tag overlap.
 */
export function deterministicSimilarity(
  candidate: CandidateTopic,
  prior: PriorArticleSummary,
): number {
  const titleScore = tokenSimilarity(candidate.title, prior.title);
  const tagsA = new Set(candidate.tags.map((t) => t.toLowerCase()));
  const tagsB = new Set(prior.tags.map((t) => t.toLowerCase()));
  const tagOverlap =
    tagsA.size === 0 || tagsB.size === 0
      ? 0
      : [...tagsA].filter((t) => tagsB.has(t)).length /
        Math.min(tagsA.size, tagsB.size);
  return Math.max(titleScore, tagOverlap);
}

/** The highest deterministic similarity against any prior, and its title. */
export function bestDeterministicMatch(
  candidate: CandidateTopic,
  priors: readonly PriorArticleSummary[],
): { similarity: number; matchedTitle: string | null } {
  let best = 0;
  let matchedTitle: string | null = null;
  for (const prior of priors) {
    const score = deterministicSimilarity(candidate, prior);
    if (score > best) {
      best = score;
      matchedTitle = prior.title;
    }
  }
  return { similarity: best, matchedTitle };
}
