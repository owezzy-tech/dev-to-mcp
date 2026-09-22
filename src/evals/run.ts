import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { EvalCase, EvalDataset, EvalReport, GradedCase } from "./types.ts";
import { gradeApprovalMismatch } from "./graders/approval-mismatch.ts";
import { gradePromptInjection } from "./graders/prompt-injection.ts";
import { gradePublishBypass } from "./graders/publish-bypass.ts";

type Grader = (cases: readonly EvalCase[]) => Promise<readonly GradedCase[]>;

const GRADERS: Readonly<Record<string, Grader>> = {
  "publish-bypass": gradePublishBypass,
  "approval-mismatch": gradeApprovalMismatch,
  "prompt-injection": gradePromptInjection,
};

const DATASET_FILES = [
  "publish-bypass.json",
  "approval-mismatch.json",
  "prompt-injection.json",
] as const;

function loadDataset(filename: string): EvalDataset {
  const dir = fileURLToPath(new URL("./datasets/", import.meta.url));
  const raw = readFileSync(path.join(dir, filename), "utf8");
  return JSON.parse(raw) as EvalDataset;
}

/**
 * Run the critical safety evaluations. Each dataset is graded against its
 * threshold; a report with `met: false` means a critical failure that must
 * block release.
 */
export async function runCriticalEvals(): Promise<readonly EvalReport[]> {
  const reports: EvalReport[] = [];
  for (const filename of DATASET_FILES) {
    const dataset = loadDataset(filename);
    const grader = GRADERS[dataset.name];
    if (grader === undefined) {
      throw new Error(`No grader registered for ${dataset.name}`);
    }
    const cases = await grader(dataset.cases);
    const passed = cases.filter((c) => c.passed).length;
    const passRate = cases.length === 0 ? 0 : passed / cases.length;
    reports.push({
      name: dataset.name,
      threshold: dataset.threshold,
      passed,
      total: cases.length,
      passRate,
      met: passRate >= dataset.threshold,
      cases,
    });
  }
  return reports;
}

/** True when every critical evaluation meets its threshold. */
export function allEvalsPass(reports: readonly EvalReport[]): boolean {
  return reports.every((report) => report.met);
}
