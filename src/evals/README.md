# Evaluation boundary

`evals` holds versioned regression datasets, graders, and release thresholds.
It is the product release gate: CI blocks when a critical evaluation falls
below its threshold.

- `datasets/*.json` — versioned, data-driven case lists for each critical
  scenario (publish-bypass, approval-mismatch, prompt-injection).
- `graders/*.ts` — grader functions that run each case against the real use
  cases with deterministic in-memory fakes.
- `run.ts` — the runner: loads datasets, runs graders, and computes a
  pass-rate against each threshold.
- `cli.ts` — `npm run eval`: prints the threshold report and exits non-zero on
  failure.

Critical thresholds are `1.0`: a single publish-bypass, approval-mismatch, or
prompt-injection failure blocks release.
