import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync("compose.yml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const dockerWorkflow = readFileSync(".github/workflows/docker.yml", "utf8");
const readme = readFileSync("README.md", "utf8");
const license = readFileSync("LICENSE", "utf8");
const docsIndex = readFileSync("docs/README.md", "utf8");
const contributorGuide = readFileSync("docs/CONTRIBUTING.md", "utf8");
const copilotInstructions = readFileSync(
  ".github/copilot-instructions.md",
  "utf8",
);
const rootCopilotInstructions = readFileSync(
  ".copilot-instructions.md",
  "utf8",
);
const cursorRules = readFileSync(".cursorrules", "utf8");
const architectureBaseline = readFileSync(
  "docs/reference/architecture-baseline.md",
  "utf8",
);

const mustRequirementIds = [
  "FR-001",
  "FR-002",
  "FR-003",
  "FR-004",
  "FR-005",
  "FR-010",
  "FR-011",
  "FR-012",
  "FR-013",
  "FR-014",
  "FR-020",
  "FR-021",
  "FR-022",
  "FR-023",
  "FR-024",
  "FR-025",
  "FR-026",
  "FR-030",
  "FR-031",
  "FR-032",
  "FR-033",
  "FR-034",
  "FR-035",
  "FR-040",
  "FR-041",
  "FR-042",
  "FR-043",
  "FR-050",
  "FR-051",
  "FR-052",
  "FR-053",
  "FR-060",
  "FR-061",
  "FR-062",
  "FR-063",
  "FR-064",
  "FR-070",
  "FR-071",
  "FR-073",
  "SEC-001",
  "SEC-002",
  "SEC-003",
  "SEC-004",
  "SEC-005",
  "SEC-006",
  "SEC-007",
  "SEC-008",
  "SEC-009",
  "SEC-010",
  "SEC-011",
] as const;

describe("delivery contracts", () => {
  it("keeps local data services bound to loopback", () => {
    expect(compose).toContain('"127.0.0.1:${POSTGRES_PORT:-5432}:5432"');
    expect(compose).toContain('"127.0.0.1:${REDIS_PORT:-6379}:6379"');
  });

  it("blocks image publication until release gates pass", () => {
    const buildJob = dockerWorkflow.slice(
      dockerWorkflow.indexOf("  build:"),
      dockerWorkflow.indexOf("  publish:"),
    );
    const publishJob = dockerWorkflow.slice(
      dockerWorkflow.indexOf("  publish:"),
    );

    expect(dockerfile).toMatch(/^FROM node:22-slim$/m);
    expect(dockerWorkflow).not.toContain("nickytonline");
    expect(buildJob).toContain("npm audit --omit=dev --audit-level=high");
    expect(buildJob).not.toContain("test -f LICENSE");
    expect(publishJob).toContain("test -f LICENSE");
  });

  it("assigns every SRS Must requirement to an owning bead", () => {
    expect(architectureBaseline).toContain(
      "39 functional and 11 security requirements marked Must",
    );
    for (const requirementId of mustRequirementIds) {
      expect(architectureBaseline).toMatch(
        new RegExp(`\\| ${requirementId} \\|[^\\n]+\\| dev-to-mcp-4tw\\.`),
      );
    }
  });

  it("keeps contributor and deployment guidance aligned", () => {
    expect(readme).not.toContain("docker.io/nickytonline");
    expect(readme).toContain("Distributed under the MIT License");
    expect(readme).toContain("[LICENSE](LICENSE)");
    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 Owen Adirah");
    expect(contributorGuide).not.toContain(
      "repository-level license remains unverified",
    );
    for (const guide of [
      copilotInstructions,
      rootCopilotInstructions,
      cursorRules,
    ]) {
      expect(guide).toContain("Node.js 22+");
      expect(guide).toContain(
        "Tool failures currently propagate through the MCP SDK",
      );
      expect(guide).toContain("top-level `test/` directory");
    }
  });

  it("publishes a navigable documentation entry point", () => {
    expect(readme).toContain("<summary>Table of Contents</summary>");
    expect(readme).toContain(
      "docs/architecture/project-architecture.visual-check.1440x900.light.png",
    );
    expect(readme).toContain("docs/tutorials/getting-started.md");
    expect(readme).toContain("docs/how-to/connect-an-mcp-client.md");
    expect(docsIndex).toContain("tutorials/getting-started.md");
    expect(docsIndex).toContain("how-to/connect-an-mcp-client.md");
    expect(contributorGuide).toContain(
      "npm audit --omit=dev --audit-level=high",
    );
  });
});
