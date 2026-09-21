import { extractCitations, countVerificationMarkers } from "./citations.ts";
import { tokenSimilarity } from "./duplication.ts";

export type LintSeverity = "blocker" | "warning";

export interface LintFinding {
  readonly check: string;
  readonly severity: LintSeverity;
  readonly message: string;
  readonly line: number | null;
}

export interface DraftLintReport {
  readonly passed: boolean;
  readonly findings: readonly LintFinding[];
  readonly blockers: readonly LintFinding[];
  readonly warnings: readonly LintFinding[];
}

export interface LintOptions {
  /** Prior drafts/snapshots compared against for duplication. */
  readonly priors?: readonly string[];
  /** Terms or patterns that render content prohibited. */
  readonly prohibited?: readonly string[];
  /** Whether first-person experience has been confirmed by the author. */
  readonly userConfirmedExperience?: boolean;
  /** Duplication similarity threshold (0..1). */
  readonly duplicationThreshold?: number;
}

const CLAIM_PATTERNS = [
  /\b(is|are)\s+the\s+(best|fastest|most|only|top|leading)\b/i,
  /\boutperforms?\b/i,
  /\bfaster than\b/i,
  /\breduces? .* by \d+%?/i,
  /\bproven to\b/i,
  /\bguarantees?\b/i,
];

const FIRST_PERSON_EXPERIENCE =
  /\b(i|we)\s+(built|have used|have been|deployed|found|learned|discovered|migrated|scaled)\b/i;

const DEFAULT_PROHIBITED = [
  "prompt injection",
  "ignore previous instructions",
  "disregard prior",
] as const;

const URL_PATTERN = /\]\(([^)\s]+)\)/g;

/**
 * Deterministic quality checks (FR-033). Each check is a pure function that
 * returns findings; `lintDraft` composes them into a single report. A finding
 * with severity `blocker` prevents the draft from being submitted for review.
 */
export function lintDraft(
  markdown: string,
  options: LintOptions = {},
): DraftLintReport {
  const findings = [
    ...checkDuplication(markdown, options),
    ...checkUnsupportedClaims(markdown),
    ...checkBrokenLinks(markdown),
    ...checkCodeContext(markdown),
    ...checkProhibitedContent(
      markdown,
      options.prohibited ?? DEFAULT_PROHIBITED,
    ),
    ...checkPersonalExperience(
      markdown,
      options.userConfirmedExperience ?? false,
    ),
  ];
  const blockers = findings.filter((f) => f.severity === "blocker");
  const warnings = findings.filter((f) => f.severity === "warning");
  return { passed: blockers.length === 0, findings, blockers, warnings };
}

function checkDuplication(
  markdown: string,
  options: LintOptions,
): LintFinding[] {
  const priors = options.priors ?? [];
  const threshold = options.duplicationThreshold ?? 0.6;
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);

  const findings: LintFinding[] = [];
  for (const prior of priors) {
    for (const paragraph of paragraphs) {
      const similarity = tokenSimilarity(prior, paragraph);
      if (similarity >= threshold) {
        findings.push({
          check: "duplication",
          severity: "blocker",
          message: `Draft content duplicates prior material (${(similarity * 100).toFixed(0)}% similar).`,
          line: lineNumberOf(markdown, paragraph),
        });
      }
    }
  }
  return dedupe(findings);
}

function checkUnsupportedClaims(markdown: string): LintFinding[] {
  const citations = extractCitations(markdown);
  const hasMarker = countVerificationMarkers(markdown) > 0;

  const lines = markdown.split("\n");
  const findings: LintFinding[] = [];
  lines.forEach((line, index) => {
    const isClaim = CLAIM_PATTERNS.some((pattern) => pattern.test(line));
    const hasCitation = /\[[^\]]*\]\(|\[\d+\]/.test(line);
    if (isClaim && !hasCitation && !hasMarker && citations.length === 0) {
      findings.push({
        check: "unsupported-claim",
        severity: "blocker",
        message: "A claim appears without a citation or verification marker.",
        line: index + 1,
      });
    }
  });
  return findings;
}

function checkBrokenLinks(markdown: string): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const match of markdown.matchAll(URL_PATTERN)) {
    const url = match[1];
    if (url === undefined) {
      continue;
    }
    if (!isWellFormedUrl(url)) {
      findings.push({
        check: "broken-link",
        severity: "blocker",
        message: `Malformed link target: ${url}`,
        line: lineNumberOf(markdown, url),
      });
    }
  }
  return findings;
}

function checkCodeContext(markdown: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const fence = /^```([A-Za-z0-9_+-]*)\s*$/;
  const lines = markdown.split("\n");
  lines.forEach((line, index) => {
    if (!line.startsWith("```")) {
      return;
    }
    const match = fence.exec(line);
    const language = match?.[1];
    if (language === undefined || language === "") {
      findings.push({
        check: "code-context",
        severity: "warning",
        message: "A fenced code block has no language identifier.",
        line: index + 1,
      });
    }
  });
  return findings;
}

function checkProhibitedContent(
  markdown: string,
  prohibited: readonly string[],
): LintFinding[] {
  const lower = markdown.toLowerCase();
  const findings: LintFinding[] = [];
  for (const term of prohibited) {
    if (lower.includes(term.toLowerCase())) {
      findings.push({
        check: "prohibited-content",
        severity: "blocker",
        message: `Prohibited content matched: ${term}`,
        line: lineNumberOf(markdown, term),
      });
    }
  }
  return findings;
}

function checkPersonalExperience(
  markdown: string,
  userConfirmed: boolean,
): LintFinding[] {
  if (userConfirmed) {
    return [];
  }
  const findings: LintFinding[] = [];
  const lines = markdown.split("\n");
  lines.forEach((line, index) => {
    if (FIRST_PERSON_EXPERIENCE.test(line)) {
      findings.push({
        check: "personal-experience",
        severity: "blocker",
        message:
          "First-person experience is asserted without author confirmation (FR-035).",
        line: index + 1,
      });
    }
  });
  return findings;
}

function isWellFormedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function lineNumberOf(markdown: string, needle: string): number | null {
  const index = markdown.indexOf(needle);
  if (index === -1) {
    return null;
  }
  return markdown.slice(0, index).split("\n").length;
}

function dedupe(findings: LintFinding[]): LintFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.check}:${finding.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
