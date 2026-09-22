import { allEvalsPass, runCriticalEvals } from "./run.ts";
import { summarize } from "./types.ts";

const reports = await runCriticalEvals();

for (const report of reports) {
  console.log(summarize(report));
  for (const entry of report.cases) {
    if (!entry.passed) {
      console.log(`  ✗ ${entry.id}: ${entry.label} — ${entry.detail}`);
    }
  }
}

if (!allEvalsPass(reports)) {
  console.error("Critical evaluation thresholds were not met.");
  process.exit(1);
}

console.log("All critical evaluation thresholds met.");
