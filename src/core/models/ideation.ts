/** A cited source backing an idea or a draft claim. */
export interface IdeaEvidence {
  readonly title: string;
  readonly url: string | null;
}

/**
 * A research-grounded article idea (FR-030). Every idea explains its audience,
 * problem, differentiation, and supporting evidence.
 */
export interface Idea {
  readonly title: string;
  readonly audience: string;
  readonly problem: string;
  readonly differentiation: string;
  readonly evidence: readonly IdeaEvidence[];
  /** Calibrated 0..1 relevance score assigned by the generator. */
  readonly score: number;
}

/** A generated Markdown draft (FR-031/032). */
export interface GeneratedDraft {
  readonly title: string;
  readonly markdown: string;
  /** Source URLs/identifiers referenced by the draft. */
  readonly citations: readonly string[];
  /** Count of explicit `[VERIFY]` markers for uncited claims. */
  readonly verificationMarkerCount: number;
}

export interface GenerateIdeasInput {
  readonly topic: string;
  readonly evidence: readonly IdeaEvidence[];
  readonly count: number;
}

export interface GenerateDraftInput {
  readonly idea: Idea;
  readonly styleGuidance?: string;
}
