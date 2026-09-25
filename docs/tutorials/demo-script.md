# 90-second demonstration

A scripted walkthrough of the safe publication journey, from research to an
audited publish. Run against a local `docker compose up` deployment with the
dashboard built.

## Setup (before the clock starts)

```bash
docker compose up -d
cd dashboard && npm ci && npm run build
open http://localhost:3535
```

## The journey

1. **Discover tools (0–15s)** — In a WebMCP-compatible browser, open the
   dashboard and sign in. The banner confirms WebMCP detected and lists the
   registered tools. Point out that the same handlers back MCP and WebMCP.

2. **Research a topic (15–35s)** — Ask the agent to "find recent Angular
   articles and identify gaps." The action log updates visibly, article
   evidence appears, and gap analysis returns themes with a confidence
   indicator.

3. **Select an idea (35–50s)** — The agent proposes three differentiated,
   cited ideas. Select one; the dashboard moves to drafting.

4. **Generate and review (50–70s)** — The agent generates a Markdown draft
   with citations and `[VERIFY]` markers. The quality gate runs; any
   unsupported claim or personal-experience block is surfaced and blocks
   submission.

5. **Approve the exact version (70–85s)** — Approve the exact version and
   content hash. Emphasize that *only now* can publish succeed; a scheduler or
   agent cannot publish without this approval.

6. **Publish and audit (85–90s)** — Publish succeeds, the DEV.to URL is
   displayed, and the chronological audit trail (with correlation IDs) is
   shown end to end.

## Safety beats to hit

- Attempting to publish before approval is rejected (publish-bypass).
- Editing after approval invalidates the approval and returns the draft to
  review (approval-mismatch).
- Retrieved content is shown as evidence, never executed as instructions
  (prompt-injection).
