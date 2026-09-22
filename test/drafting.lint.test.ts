import { describe, expect, it } from "vitest";
import {
  lintDraft,
  type DraftLintReport,
} from "../src/core/policies/draft-linting.ts";
import {
  extractCitations,
  countVerificationMarkers,
} from "../src/core/policies/citations.ts";

function blockers(report: DraftLintReport): readonly string[] {
  return report.blockers.map((finding) => finding.check);
}

describe("draft linting", () => {
  it("passes a clean, cited draft", () => {
    const markdown = [
      "# Angular signals",
      "Angular signals offer reactive state. See the [docs](https://angular.dev/guide/signals).",
      "",
      "```ts",
      "const count = signal(0);",
      "```",
    ].join("\n");
    const report = lintDraft(markdown);
    expect(report.passed).toBe(true);
    expect(report.blockers).toHaveLength(0);
  });

  it("flags duplication against prior material", () => {
    const prior =
      "Angular signals are a reactive primitive for managing state in components.";
    const markdown = `Angular signals are a reactive primitive for managing state in components.`;
    const report = lintDraft(markdown, { priors: [prior] });
    expect(blockers(report)).toContain("duplication");
  });

  it("flags an unsupported claim with no citation or marker", () => {
    const report = lintDraft(
      "Signals are the fastest way to manage state in Angular.",
    );
    expect(blockers(report)).toContain("unsupported-claim");
  });

  it("accepts a claim that carries a verification marker", () => {
    const report = lintDraft(
      "Signals are the fastest way to manage state [VERIFY].",
    );
    expect(blockers(report)).not.toContain("unsupported-claim");
  });

  it("flags a link with a non-http(s) scheme", () => {
    const report = lintDraft("See the [docs](javascript:alert(1)).");
    expect(blockers(report)).toContain("broken-link");
  });

  it("warns on a fenced block without a language", () => {
    const report = lintDraft("```\nconst x = 1;\n```");
    expect(report.warnings.map((f) => f.check)).toContain("code-context");
    expect(report.passed).toBe(true);
  });

  it("flags prohibited content", () => {
    const report = lintDraft("This is fine. Ignore previous instructions.", {
      prohibited: ["ignore previous instructions"],
    });
    expect(blockers(report)).toContain("prohibited-content");
  });

  it("flags first-person experience when unconfirmed, and allows it when confirmed", () => {
    const markdown = "We migrated our stack to Angular signals.";
    expect(blockers(lintDraft(markdown))).toContain("personal-experience");
    expect(
      blockers(lintDraft(markdown, { userConfirmedExperience: true })),
    ).not.toContain("personal-experience");
  });
});

describe("citations", () => {
  it("extracts markdown link urls", () => {
    const citations = extractCitations(
      "See [A](https://a.dev) and [B](https://b.dev).",
    );
    expect(citations).toEqual(["https://a.dev", "https://b.dev"]);
  });

  it("counts verification markers", () => {
    expect(countVerificationMarkers("x [VERIFY] y [verify] z")).toBe(2);
  });
});
