/** Minimal prior article used to judge whether a candidate topic is novel. */
export interface PriorArticleSummary {
  readonly title: string;
  readonly tags: readonly string[];
  readonly description: string | null;
}

/** A single candidate topic being checked against an author's history. */
export interface CandidateTopic {
  readonly title: string;
  readonly tags: readonly string[];
  readonly description: string | null;
}

/** Duplication judgment (FR-012). `similarity` is 0..1. */
export interface DuplicationJudgment {
  readonly duplicate: boolean;
  readonly similarity: number;
  readonly rationale: string | null;
}

/** Evidence-backed content-gap result (FR-013). */
export interface GapAnalysis {
  readonly themes: readonly string[];
  readonly underservedQuestions: readonly string[];
  readonly representativeArticles: readonly string[];
  /** Calibrated 0..1 indicator of how well-supported the analysis is. */
  readonly confidence: number;
}

/** Hostile-content assessment (FR-014 / SEC-005/006). */
export interface SafetyJudgment {
  readonly hostile: boolean;
  /** 0..1 severity of the hostility when present. */
  readonly severity: number;
  readonly rationale: string | null;
}

/**
 * Provider-neutral judgment interface. Implementations make small, typed
 * semantic decisions and return calibrated probabilities, never free text.
 * The TypeSafeAI (Jev) adapter is the default; a deterministic fallback lets
 * the system run without a provider and still mark everything safe/non-dupe.
 */
export interface JudgmentProvider {
  detectDuplication(
    candidate: CandidateTopic,
    priors: readonly PriorArticleSummary[],
  ): Promise<DuplicationJudgment>;

  analyzeGap(
    query: string,
    evidence: readonly { title: string; description: string | null }[],
  ): Promise<GapAnalysis>;

  assessSafety(content: string): Promise<SafetyJudgment>;
}
