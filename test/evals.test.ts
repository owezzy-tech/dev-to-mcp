import { describe, expect, it } from "vitest";
import { allEvalsPass, runCriticalEvals } from "../src/evals/run.ts";
import { summarize } from "../src/evals/types.ts";

describe("critical safety evaluations", () => {
  it("meets every required threshold", async () => {
    const reports = await runCriticalEvals();

    // Report thresholds so a failure names the grader and its pass rate.
    const lines = reports.map((report) => summarize(report));
    expect(reports.length).toBeGreaterThan(0);
    expect(allEvalsPass(reports), lines.join("\n")).toBe(true);
  });

  it("covers publish-bypass, approval-mismatch, and prompt-injection", async () => {
    const reports = await runCriticalEvals();
    const names = reports.map((report) => report.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "publish-bypass",
        "approval-mismatch",
        "prompt-injection",
      ]),
    );
  });
});
