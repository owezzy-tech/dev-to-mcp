import type { GapAnalysis } from "../ports/judgment-provider.ts";
import type { SnapshotRecord } from "../ports/retrieval-repository.ts";

export const MAX_THEMES = 8;
export const MAX_QUESTIONS = 8;
export const MAX_REPRESENTATIVE = 5;

/** Deterministic theme extraction: the most frequent tags across evidence. */
export function extractThemes(
  evidence: readonly SnapshotRecord[],
): readonly string[] {
  const counts = new Map<string, number>();
  for (const record of evidence) {
    for (const tag of record.tagList) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_THEMES)
    .map(([tag]) => tag);
}

/**
 * Question-form gaps derived deterministically from themes that are thinly
 * represented in the evidence, plus the query itself when coverage is low.
 */
export function deriveUnderservedQuestions(
  query: string,
  themes: readonly string[],
  evidence: readonly SnapshotRecord[],
): readonly string[] {
  const tagCounts = new Map<string, number>();
  for (const record of evidence) {
    for (const tag of record.tagList) {
      const key = tag.toLowerCase();
      tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    }
  }
  const thin = themes.filter((theme) => (tagCounts.get(theme) ?? 0) <= 1);
  const questions = thin.map(
    (theme) => `No existing article covers "${theme}" in depth.`,
  );
  if (evidence.length <= 1) {
    questions.unshift(`"${query}" is underserved by current content.`);
  }
  return questions.slice(0, MAX_QUESTIONS);
}

/** Representative articles: the most engaged evidence titles. */
export function representativeArticles(
  evidence: readonly SnapshotRecord[],
): readonly string[] {
  return [...evidence]
    .sort(
      (a, b) =>
        b.commentsCount +
        b.publicReactionsCount -
        (a.commentsCount + a.publicReactionsCount),
    )
    .slice(0, MAX_REPRESENTATIVE)
    .map((record) => record.title);
}

/** Confidence heuristic from the amount of supporting evidence. */
export function evidenceConfidence(evidenceCount: number): number {
  return Math.min(evidenceCount / 5, 1);
}

/**
 * Bound a gap analysis to safe sizes and fill deterministic fallbacks where a
 * provider returned nothing. Returns a new analysis object.
 */
export function boundGapAnalysis(
  analysis: GapAnalysis,
  evidence: readonly SnapshotRecord[],
  query: string,
): GapAnalysis {
  const themes =
    analysis.themes.length > 0 ? analysis.themes : extractThemes(evidence);
  const questions =
    analysis.underservedQuestions.length > 0
      ? analysis.underservedQuestions
      : deriveUnderservedQuestions(query, themes, evidence);
  const representative =
    analysis.representativeArticles.length > 0
      ? analysis.representativeArticles
      : representativeArticles(evidence);
  const confidence =
    analysis.confidence > 0
      ? analysis.confidence
      : evidenceConfidence(evidence.length);

  return {
    themes: themes.slice(0, MAX_THEMES),
    underservedQuestions: questions.slice(0, MAX_QUESTIONS),
    representativeArticles: representative.slice(0, MAX_REPRESENTATIVE),
    confidence: Math.min(Math.max(confidence, 0), 1),
  };
}
