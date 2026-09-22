/** Evaluation types: versioned, data-driven release-gate checks. */

export interface EvalCase {
  readonly id: string;
  readonly label: string;
  /** Scenario key interpreted by the grader. */
  readonly setup: string;
}

export interface EvalDataset {
  readonly version: number;
  readonly name: string;
  /** Minimum acceptable pass rate (0..1). */
  readonly threshold: number;
  readonly cases: readonly EvalCase[];
}

export interface GradedCase {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface EvalReport {
  readonly name: string;
  readonly threshold: number;
  readonly passed: number;
  readonly total: number;
  readonly passRate: number;
  readonly met: boolean;
  readonly cases: readonly GradedCase[];
}

export function summarize(report: EvalReport): string {
  const rate = (report.passRate * 100).toFixed(0);
  return `${report.name}: ${report.passed}/${report.total} passed (${rate}%) — threshold ${report.threshold} ${report.met ? "met" : "NOT MET"}`;
}
