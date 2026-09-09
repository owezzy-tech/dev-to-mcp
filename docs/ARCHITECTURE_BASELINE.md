# Architecture baseline and delivery contracts

## Decisions and boundaries

This baseline preserves the public dev.to discovery MCP server. No authenticated publishing, OAuth, Prisma schema, Redis client, embeddings, model calls, scheduler, Angular UI, or WebMCP runtime registration is introduced.

| Decision | Contract |
| --- | --- |
| Shared core | `src/core` owns transport-independent typed models, policies, and ports; adapters may depend on it, never the reverse. |
| Thin adapters | `src/mcp` owns Streamable HTTP adaptation; `src/webmcp` owns browser adaptation only. Neither owns business policy or credentials. |
| Explicit workflows | `src/workflows` coordinates named, approval-aware use cases through core ports; it has no scheduler or autonomous publish path. |
| Evaluation gate | `src/evals` owns fixtures, hostile cases, rubrics, and release thresholds; it is not runtime code. |
| Existing public contract | `src/index.ts` retains its six tool names, titles, descriptions, complete input schemas, read/open-world annotations, and `GET /mcp` response. `test/mcp.characterization.test.ts` guards the wire contract, and `test/utils.test.ts` guards the text result envelope. |

The server currently consumes `PORT`, `NODE_ENV`, `SERVER_NAME`, `SERVER_VERSION`, and `LOG_LEVEL`. `compose.yml` supplies loopback-bound PostgreSQL with pgvector and Redis for future adapters only. Its `POSTGRES_PASSWORD=dev_to_mcp_local` value is local-only and must never be reused as a deployment secret. Future credentials stay server-side and out of logs/browser code. CI runs clean install, typecheck, lint, format check, tests, and build on Node 22.

Upstream repository metadata reports no license: the GitHub license API returns HTTP 404 and no `LICENSE`, `COPYING`, or `NOTICE` file exists in the repository tree. The upstream `package.json` and README declare MIT, but that package-level metadata is not a repository-level license grant. Provenance and license verification therefore remain an SEC-011 release gate, enforced by the Docker publish workflow.

## SRS Must traceability

The source of truth is `docs/DEVto_Agent_Publishing_Platform_SRS.docx`, sections 4 and 7. It contains 39 functional and 11 security requirements marked Must; all 50 appear below.

`Preserved` is existing behavior protected by characterization. `Partial` means the current behavior covers only part of the requirement. `Deferred` identifies the future boundary and deliberately does not claim implementation. The owner is the Beads delivery phase responsible for completing the requirement.

| Requirement | Architecture trace | Owner | Status |
| --- | --- | --- | --- |
| FR-001 | Existing discovery lists articles with the supported filters; typed normalization and limits remain core work. | dev-to-mcp-4tw.2 | Preserved |
| FR-002 | Existing discovery retrieves articles by numeric ID or canonical author/slug path. | dev-to-mcp-4tw.2 | Preserved |
| FR-003 | Existing discovery retrieves public profiles, tags, and threaded comments. | dev-to-mcp-4tw.2 | Preserved |
| FR-004 | Stable typed Forem response normalization belongs in the shared core. | dev-to-mcp-4tw.2 | Deferred |
| FR-005 | Pagination limits belong in shared schemas and public discovery handlers. | dev-to-mcp-4tw.2 | Deferred |
| FR-010 | Semantic search is a core port backed by PostgreSQL/pgvector. | dev-to-mcp-4tw.6 | Deferred |
| FR-011 | Hybrid ranking is core policy with evaluation fixtures. | dev-to-mcp-4tw.6 | Deferred |
| FR-012 | Author-history comparison and duplicate detection use the retrieval port. | dev-to-mcp-4tw.6 | Deferred |
| FR-013 | Content-gap results expose typed evidence and confidence. | dev-to-mcp-4tw.6 | Deferred |
| FR-014 | Third-party content remains untrusted across retrieval and workflow boundaries. | dev-to-mcp-4tw.6 | Deferred |
| FR-020 | A server-side Forem adapter owns API-key authentication and version headers. | dev-to-mcp-4tw.4 | Deferred |
| FR-021 | Authenticated article listing is a shared application handler. | dev-to-mcp-4tw.4 | Deferred |
| FR-022 | Draft creation accepts the SRS article fields through the authenticated adapter. | dev-to-mcp-4tw.4 | Deferred |
| FR-023 | Draft updates create versions and append audit events. | dev-to-mcp-4tw.4 | Deferred |
| FR-024 | Publish verifies an unexpired approval for the exact draft version. | dev-to-mcp-4tw.4 | Deferred |
| FR-025 | Publish rejects missing, rejected, expired, mismatched, or invalidated approvals. | dev-to-mcp-4tw.4 | Deferred |
| FR-026 | Visibility-changing operations return confirmation and use idempotency where supported. | dev-to-mcp-4tw.4 | Deferred |
| FR-030 | Idea generation returns audience, value, differentiation, and cited evidence. | dev-to-mcp-4tw.7 | Deferred |
| FR-031 | Draft generation produces original Markdown from approved topics and style guidance. | dev-to-mcp-4tw.7 | Deferred |
| FR-032 | Technical claims carry sources or explicit verification markers. | dev-to-mcp-4tw.7 | Deferred |
| FR-033 | Drafting runs deterministic duplication, claim, link, context, and policy checks. | dev-to-mcp-4tw.7 | Deferred |
| FR-034 | Revision, manual edit, approval, rejection, and discard are explicit transitions. | dev-to-mcp-4tw.7 | Deferred |
| FR-035 | Core policy prohibits invented personal-experience claims. | dev-to-mcp-4tw.7 | Deferred |
| FR-040 | A scheduler invokes research and draft preparation workflows. | dev-to-mcp-4tw.9 | Deferred |
| FR-041 | Scheduling never grants publication authority. | dev-to-mcp-4tw.9 | Deferred |
| FR-042 | Weekly cadence and topic configuration are scheduling policy. | dev-to-mcp-4tw.9 | Deferred |
| FR-043 | Low-value or duplicate runs produce an explicit no-publish result. | dev-to-mcp-4tw.9 | Deferred |
| FR-050 | Existing Streamable HTTP metadata, schemas, descriptions, annotations, and tools are characterized. | dev-to-mcp-4tw.2 | Preserved |
| FR-051 | Existing public tools are read/open-world annotated; write-tool separation and annotations remain authenticated adapter work. | dev-to-mcp-4tw.2 / dev-to-mcp-4tw.4 | Partial |
| FR-052 | MCP session expiration and cleanup belong in the MCP adapter. | dev-to-mcp-4tw.2 | Deferred |
| FR-053 | Safe actionable error normalization belongs in shared errors and adapter mapping. | dev-to-mcp-4tw.2 | Deferred |
| FR-060 | Top-level WebMCP registration belongs only in the dashboard adapter. | dev-to-mcp-4tw.8 | Deferred |
| FR-061 | Privileged WebMCP tools call authenticated backend handlers; secrets remain server-side. | dev-to-mcp-4tw.8 | Deferred |
| FR-062 | Dashboard state exposes capabilities, actions, evidence, drafts, approvals, and audit events. | dev-to-mcp-4tw.8 | Deferred |
| FR-063 | WebMCP calls update both structured results and visible UI state. | dev-to-mcp-4tw.8 | Deferred |
| FR-064 | Unsupported browsers receive setup guidance without losing ordinary dashboard use. | dev-to-mcp-4tw.8 | Deferred |
| FR-070 | Material workflow events persist sanitized actor, correlation, tool, result, and resource data. | dev-to-mcp-4tw.5 | Deferred |
| FR-071 | Approval records persist approver, decision, timestamp, version/hash, and feedback. | dev-to-mcp-4tw.5 | Deferred |
| FR-073 | Article workflows expose chronological audit history. | dev-to-mcp-4tw.5 | Deferred |
| SEC-001 | Secrets stay in server environment or managed secret storage and out of code, logs, prompts, and clients. | dev-to-mcp-4tw.3 | Deferred |
| SEC-002 | Authenticated backend sessions and per-tool authorization belong in the security foundation. | dev-to-mcp-4tw.3 | Deferred |
| SEC-003 | Read, draft-write, and publish permissions are distinct server-side capabilities. | dev-to-mcp-4tw.3 / dev-to-mcp-4tw.4 | Deferred |
| SEC-004 | Existing arguments are schema-validated; size limits and sanitization remain hardening work. | dev-to-mcp-4tw.2 / dev-to-mcp-4tw.3 | Partial |
| SEC-005 | Retrieval treats article bodies, comments, links, and tool content as hostile data. | dev-to-mcp-4tw.6 | Deferred |
| SEC-006 | Retrieved instructions cannot trigger tools, disclosure, policy changes, approval, or publication. | dev-to-mcp-4tw.6 | Deferred |
| SEC-007 | Server-side publish verification enforces approval, version/hash, actor, and policy. | dev-to-mcp-4tw.4 / dev-to-mcp-4tw.5 | Deferred |
| SEC-008 | Structured logging and audit persistence redact secrets, tokens, and unnecessary sensitive content. | dev-to-mcp-4tw.3 | Deferred |
| SEC-009 | Timeouts/retries, rate limits, and duplicate-publish protection span discovery, security, and workflows. | dev-to-mcp-4tw.2 / dev-to-mcp-4tw.3 / dev-to-mcp-4tw.5 | Deferred |
| SEC-010 | The lockfile pins dependencies and the publish workflow audits production dependencies; current high advisories block release. | dev-to-mcp-4tw.10 | Blocked |
| SEC-011 | Upstream licensing is documented, but redistribution remains blocked until a repository-level grant is verified. | dev-to-mcp-4tw.1 | Blocked |

## Current release blockers

- Dependency audit: `@modelcontextprotocol/sdk@1.17.0` is affected by GHSA-345p-7cg4-v4c7, GHSA-w48q-cv73-mx4w, and GHSA-8r9q-7v3j-jr4g. The Docker publish workflow runs `npm audit --omit=dev --audit-level=high` and cannot publish until remediation lands in `dev-to-mcp-4tw.10`.
- Redistribution license: upstream package metadata says MIT, but no repository-level license grant is present. The Docker publish workflow requires a checked-in `LICENSE` and cannot publish until provenance is resolved.

Before any future workflow ships, `src/evals` must contain normal, ambiguous, hostile-content, failed-upstream, approval-mismatch, and duplicate-topic regression data plus explicit correctness, safety, evidence, and duplicate-detection thresholds.
