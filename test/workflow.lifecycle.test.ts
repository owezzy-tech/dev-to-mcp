import { describe, expect, it } from "vitest";
import type { DraftState } from "../src/core/ports/article-repository.ts";
import {
  LIFECYCLE_TRANSITIONS,
  allowedTransitions,
  assertPublishAuthority,
  assertTransition,
  canTransition,
  isTerminalState,
} from "../src/core/policies/lifecycle.ts";
import { DRAFT_STATES } from "../src/core/ports/article-repository.ts";
import {
  LEASE_DURATION_MS,
  MAX_WORKFLOW_ATTEMPTS,
  backoffMs,
  hasAttemptsRemaining,
} from "../src/core/policies/scheduling.ts";
import { InvalidInputError } from "../src/errors/api-errors.ts";

const VALID: ReadonlyArray<[DraftState, DraftState, string]> = [
  ["RESEARCHING", "IDEA_READY", "AGENT"],
  ["RESEARCHING", "IDEA_READY", "SCHEDULER"],
  ["RESEARCHING", "NO_PUBLISH", "SCHEDULER"],
  ["IDEA_READY", "DRAFTING", "AGENT"],
  ["IDEA_READY", "NO_PUBLISH", "SCHEDULER"],
  ["DRAFTING", "DRAFT_READY", "AGENT"],
  ["DRAFTING", "DISCARDED", "AUTHOR"],
  ["DRAFT_READY", "AWAITING_APPROVAL", "AUTHOR"],
  ["DRAFT_READY", "DISCARDED", "AUTHOR"],
  ["DRAFT_READY", "NO_PUBLISH", "AUTHOR"],
  ["AWAITING_APPROVAL", "APPROVED", "AUTHOR"],
  ["AWAITING_APPROVAL", "REJECTED", "AUTHOR"],
  ["AWAITING_APPROVAL", "DRAFTING", "AGENT"],
  ["AWAITING_APPROVAL", "DISCARDED", "AUTHOR"],
  ["AWAITING_APPROVAL", "NO_PUBLISH", "AUTHOR"],
  ["REJECTED", "DRAFTING", "AGENT"],
  ["REJECTED", "DISCARDED", "AUTHOR"],
  ["APPROVED", "DRAFTING", "AGENT"],
  ["APPROVED", "DISCARDED", "AUTHOR"],
  ["APPROVED", "PUBLISHING", "AUTHOR"],
  ["APPROVED", "NO_PUBLISH", "AUTHOR"],
  ["PUBLISHING", "PUBLISHED", "SYSTEM"],
  ["PUBLISHING", "PUBLISHED", "AUTHOR"],
  ["PUBLISHING", "FAILED", "SYSTEM"],
  ["FAILED", "PUBLISHING", "AUTHOR"],
  ["FAILED", "DRAFTING", "AGENT"],
  ["FAILED", "DISCARDED", "AUTHOR"],
];

const INVALID_EDGES: ReadonlyArray<[DraftState, DraftState]> = [
  ["RESEARCHING", "DRAFTING"],
  ["RESEARCHING", "PUBLISHED"],
  ["IDEA_READY", "DRAFT_READY"],
  ["DRAFTING", "AWAITING_APPROVAL"],
  ["DRAFTING", "PUBLISHING"],
  ["DRAFT_READY", "APPROVED"],
  ["AWAITING_APPROVAL", "PUBLISHING"],
  ["AWAITING_APPROVAL", "PUBLISHED"],
  ["APPROVED", "PUBLISHED"],
  ["PUBLISHING", "APPROVED"],
  ["PUBLISHED", "DRAFTING"],
  ["DISCARDED", "DRAFTING"],
  ["NO_PUBLISH", "DRAFTING"],
];

describe("draft lifecycle transitions", () => {
  it("accepts every valid transition with a permitted actor", () => {
    for (const [from, to, actor] of VALID) {
      expect(
        canTransition(from, to, actor as never),
        `${from} -> ${to} as ${actor}`,
      ).toBe(true);
      expect(assertTransition(from, to, actor as never).to).toBe(to);
    }
  });

  it("rejects every invalid edge regardless of actor", () => {
    for (const [from, to] of INVALID_EDGES) {
      for (const actor of ["AUTHOR", "AGENT", "SYSTEM", "SCHEDULER"] as const) {
        expect(
          canTransition(from, to, actor),
          `${from} -> ${to} as ${actor}`,
        ).toBe(false);
        expect(() => assertTransition(from, to, actor)).toThrow(
          InvalidInputError,
        );
      }
    }
  });

  it("never lets a scheduler reach a publishing transition", () => {
    for (const transition of LIFECYCLE_TRANSITIONS) {
      if (!transition.actors.includes("SCHEDULER")) {
        continue;
      }
      expect(transition.publishes).toBe(false);
      expect(() =>
        assertPublishAuthority(transition.from, transition.to, "SCHEDULER"),
      ).not.toThrow();
    }

    expect(() =>
      assertPublishAuthority("APPROVED", "PUBLISHING", "SCHEDULER"),
    ).toThrow(InvalidInputError);
    expect(canTransition("APPROVED", "PUBLISHING", "SCHEDULER")).toBe(false);
  });

  it("reserves the approval decision for the author", () => {
    expect(canTransition("AWAITING_APPROVAL", "APPROVED", "AGENT")).toBe(false);
    expect(canTransition("AWAITING_APPROVAL", "REJECTED", "AGENT")).toBe(false);
    expect(canTransition("AWAITING_APPROVAL", "APPROVED", "AUTHOR")).toBe(true);
  });

  it("invalidates approval by forcing an edit back through drafting", () => {
    expect(canTransition("APPROVED", "DRAFTING", "AUTHOR")).toBe(true);
    expect(canTransition("APPROVED", "DRAFT_READY", "AUTHOR")).toBe(false);
  });

  it("treats PUBLISHED, DISCARDED, and NO_PUBLISH as terminal", () => {
    const terminals: DraftState[] = ["PUBLISHED", "DISCARDED", "NO_PUBLISH"];
    for (const state of terminals) {
      expect(isTerminalState(state)).toBe(true);
      for (const target of DRAFT_STATES) {
        expect(canTransition(state, target, "AUTHOR")).toBe(false);
      }
    }
  });

  it("exposes only reachable transitions per actor", () => {
    expect(allowedTransitions("AWAITING_APPROVAL", "AUTHOR")).toEqual(
      expect.arrayContaining(["APPROVED", "REJECTED", "DRAFTING", "DISCARDED"]),
    );
    expect(allowedTransitions("APPROVED", "SCHEDULER")).toEqual([]);
  });

  it("covers every required lifecycle state in the transition table", () => {
    const covered = new Set<DraftState>();
    for (const transition of LIFECYCLE_TRANSITIONS) {
      covered.add(transition.from);
      covered.add(transition.to);
    }
    for (const state of DRAFT_STATES) {
      expect(covered, `state ${state} has no lifecycle edge`).toContain(state);
    }
  });
});

describe("workflow scheduling policy", () => {
  it("backs off exponentially with a hard ceiling", () => {
    expect(backoffMs(1)).toBe(1_000);
    expect(backoffMs(2)).toBe(2_000);
    expect(backoffMs(3)).toBe(4_000);
    expect(backoffMs(20)).toBe(60_000);
    expect(backoffMs(0)).toBe(1_000);
  });

  it("stops retrying once attempts are exhausted", () => {
    expect(hasAttemptsRemaining(0)).toBe(true);
    expect(hasAttemptsRemaining(MAX_WORKFLOW_ATTEMPTS - 1)).toBe(true);
    expect(hasAttemptsRemaining(MAX_WORKFLOW_ATTEMPTS)).toBe(false);
  });

  it("holds leases long enough to cover a step", () => {
    expect(LEASE_DURATION_MS).toBeGreaterThan(0);
  });
});
