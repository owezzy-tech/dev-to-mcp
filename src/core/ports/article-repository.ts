import type { Capability } from "../policies/authorization.ts";

export const DRAFT_STATES = [
  "RESEARCHING",
  "IDEA_READY",
  "DRAFTING",
  "DRAFT_READY",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PUBLISHING",
  "PUBLISHED",
  "REJECTED",
  "DISCARDED",
  "FAILED",
  "NO_PUBLISH",
] as const;

export type DraftState = (typeof DRAFT_STATES)[number];

export type ApprovalDecision = "APPROVED" | "REJECTED";

export interface DraftSummary {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly state: DraftState;
  readonly foremArticleId: number | null;
  readonly currentVersionId: string | null;
}

export interface DraftVersionSummary {
  readonly id: string;
  readonly draftId: string;
  readonly version: number;
  readonly markdown: string;
  readonly contentHash: string;
}

export interface ApprovalSummary {
  readonly id: string;
  readonly authorId: string;
  readonly draftVersionId: string;
  readonly decision: ApprovalDecision;
  readonly contentHash: string;
  readonly expiresAtMs: number;
}

export interface PublishRunSummary {
  readonly id: string;
  readonly draftId: string | null;
  readonly state: DraftState;
  readonly result: unknown;
}

export interface ArticleRepository {
  getCapabilities(authorId: string): Promise<readonly Capability[]>;
  listDrafts(authorId: string): Promise<readonly DraftSummary[]>;
  getDraft(draftId: string): Promise<DraftSummary | undefined>;
  getCurrentVersion(draftId: string): Promise<DraftVersionSummary | undefined>;
  createDraftWithVersion(input: {
    authorId: string;
    title: string;
    tags: readonly string[];
    markdown: string;
    contentHash: string;
    foremArticleId: number;
  }): Promise<{ draft: DraftSummary; version: DraftVersionSummary }>;
  appendVersion(input: {
    draftId: string;
    markdown: string;
    contentHash: string;
    title?: string;
    state: DraftState;
  }): Promise<{ draft: DraftSummary; version: DraftVersionSummary }>;
  createApproval(input: {
    authorId: string;
    draftVersionId: string;
    decision: ApprovalDecision;
    contentHash: string;
    expiresAtMs: number;
    feedback?: string;
  }): Promise<ApprovalSummary>;
  getApprovalForVersion(
    draftVersionId: string,
  ): Promise<ApprovalSummary | undefined>;
  setDraftState(
    draftId: string,
    state: DraftState,
    foremArticleId?: number | null,
  ): Promise<void>;
  findRunByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PublishRunSummary | undefined>;
  recordRun(input: {
    authorId: string;
    draftId: string;
    idempotencyKey: string;
    state: DraftState;
    result?: unknown;
  }): Promise<void>;
}
