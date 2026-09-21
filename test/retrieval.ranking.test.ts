import { describe, expect, it } from "vitest";
import type { SnapshotRecord } from "../src/core/ports/retrieval-repository.ts";
import {
  engagementScore,
  normalize,
  rankHybrid,
  recencyScore,
  topicRelevance,
} from "../src/core/policies/ranking.ts";

const now = new Date("2026-09-22T00:00:00Z");

function snapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    id: "s1",
    authorId: null,
    foremArticleId: 1,
    title: "Angular signals deep dive",
    description: "A deep dive into signals.",
    tagList: ["angular", "signals"],
    commentsCount: 10,
    publicReactionsCount: 50,
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    authorUsername: "ada",
    observedAt: new Date("2026-09-22T00:00:00Z"),
    ...overrides,
  };
}

describe("ranking policy", () => {
  it("decays recency toward zero with age", () => {
    expect(recencyScore(new Date("2026-09-22T00:00:00Z"), now)).toBe(1);
    const older = recencyScore(new Date("2025-09-22T00:00:00Z"), now);
    const oldest = recencyScore(new Date("2020-09-22T00:00:00Z"), now);
    expect(older).toBeLessThan(1);
    expect(oldest).toBeLessThan(older);
  });

  it("gives null published dates a neutral recency", () => {
    expect(recencyScore(null, now)).toBe(0.5);
  });

  it("saturates engagement on a log scale", () => {
    expect(engagementScore(0, 0)).toBe(0);
    expect(engagementScore(10, 50)).toBeGreaterThan(engagementScore(1, 2));
    expect(engagementScore(1_000_000, 1_000_000)).toBeLessThanOrEqual(1);
  });

  it("scores topic relevance by overlap with configured topics", () => {
    expect(topicRelevance(["angular", "signals"], ["angular"])).toBe(1);
    expect(topicRelevance(["react"], ["angular"])).toBe(0);
    expect(topicRelevance([], ["angular"])).toBe(0);
    expect(topicRelevance(["angular"], [])).toBe(0.5);
  });

  it("normalizes scores to 0..1 preserving order", () => {
    expect([...normalize([1, 2, 3])]).toEqual([0, 0.5, 1]);
    expect([...normalize([5, 5, 5])]).toEqual([0.5, 0.5, 0.5]);
  });

  it("ranks vector hits ahead of text-only hits when similarity dominates", () => {
    const vectorHit = snapshot({ id: "v", title: "Signals best practices" });
    const textOnly = snapshot({ id: "t", title: "Unrelated but matches text" });

    const ranked = rankHybrid(
      [{ snapshot: textOnly, score: 10 }],
      [{ snapshot: vectorHit, score: 0.95 }],
      { now },
    );

    expect(ranked[0]?.snapshot.id).toBe("v");
    expect(ranked[0]?.components.semantic).toBe(0.95);
  });

  it("uses normalized text rank as semantic when no vector exists", () => {
    const a = snapshot({ id: "a" });
    const b = snapshot({ id: "b" });
    const ranked = rankHybrid(
      [
        { snapshot: a, score: 3 },
        { snapshot: b, score: 1 },
      ],
      [],
      { now },
    );
    expect(ranked[0]?.snapshot.id).toBe("a");
    expect(ranked[0]?.components.semantic).toBe(1);
    expect(ranked[1]?.components.semantic).toBe(0);
  });
});
