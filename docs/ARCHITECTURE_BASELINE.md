# Architecture baseline and delivery contracts

## Decisions and boundaries

This baseline preserves the public dev.to discovery MCP server. No authenticated publishing, OAuth, Prisma schema, Redis client, embeddings, model calls, scheduler, Angular UI, or WebMCP runtime registration is introduced.

| Decision | Contract |
| --- | --- |
| Shared core | `src/core` owns transport-independent typed models, policies, and ports; adapters may depend on it, never the reverse. |
| Thin adapters | `src/mcp` owns Streamable HTTP adaptation; `src/webmcp` owns browser adaptation only. Neither owns business policy or credentials. |
| Explicit workflows | `src/workflows` coordinates named, approval-aware use cases through core ports; it has no scheduler or autonomous publish path. |
| Evaluation gate | `src/evals` owns fixtures, hostile cases, rubrics, and release thresholds; it is not runtime code. |
| Existing public contract | `src/index.ts` retains its six tool names, input schemas, text result envelope, and `GET /mcp` response. `test/mcp.characterization.test.ts` is the regression guard. |

The server currently consumes `PORT`, `NODE_ENV`, `SERVER_NAME`, `SERVER_VERSION`, and `LOG_LEVEL`. `compose.yml` supplies local PostgreSQL with pgvector and Redis for future adapters only. Its `POSTGRES_PASSWORD=dev_to_mcp_local` value is local-only and must never be reused as a deployment secret. Future credentials stay server-side and out of logs/browser code. CI runs clean install, typecheck, lint, format check, tests, and build on Node 22.

Upstream repository metadata reports no license: the GitHub license API returns HTTP 404 and no `LICENSE`, `COPYING`, or `NOTICE` file exists in the repository tree. The upstream `package.json` and README declare MIT, but that package-level metadata is not a repository-level license grant. Provenance and license verification therefore remain an SEC-011 release gate.

## SRS Must traceability

`Preserved` is existing behavior protected by characterization. `Deferred` identifies the future boundary and deliberately does not claim implementation.

| Requirement | Architecture trace | Status |
| --- | --- | --- |
| FR-001 | Public discovery remains in the existing adapter; normalized public models belong in core. | Preserved |
| FR-002 | Typed normalization is core work before new discovery behavior. | Deferred |
| FR-003 | Pagination is an adapter input normalized by core types. | Preserved |
| FR-004 | Attribution belongs in typed discovery results. | Deferred |
| FR-005 | Discovery failure crosses MCP as a safe text envelope. | Preserved |
| FR-010 | Semantic retrieval is a core port plus future infrastructure adapter. | Deferred |
| FR-011 | Ranking is core policy with eval fixtures. | Deferred |
| FR-012 | Duplicate detection is a workflow using a similarity port. | Deferred |
| FR-013 | Evidence is typed core output. | Deferred |
| FR-014 | External content is untrusted data across adapter/core boundaries. | Deferred |
| FR-020 | Authenticated article management is a backend workflow. | Deferred |
| FR-021 | Create/update needs a server-side authenticated adapter. | Deferred |
| FR-022 | Article state and transitions are core policy. | Deferred |
| FR-023 | Version-bound approval is an explicit workflow input. | Deferred |
| FR-024 | Publish is an explicit approval-gated workflow. | Deferred |
| FR-025 | Idempotency is a core port/persistence contract. | Deferred |
| FR-026 | Publish verification is a workflow postcondition. | Deferred |
| FR-030 | Ideas/drafts are typed core resources. | Deferred |
| FR-031 | Claims are concurrency-safe workflows over repository ports. | Deferred |
| FR-032 | Draft linting is evaluation/core policy. | Deferred |
| FR-033 | Revision is an explicit workflow transition. | Deferred |
| FR-034 | Experience claims require evidence/policy validation. | Deferred |
| FR-035 | False-experience content is forbidden by core policy. | Deferred |
| FR-040 | Scheduling is future workflow/infrastructure work. | Deferred |
| FR-041 | Autonomous publishing is prohibited by the workflow boundary. | Deferred |
| FR-042 | Cadence is core policy, not a timer. | Deferred |
| FR-043 | No-publish is an explicit workflow result. | Deferred |
| FR-050 | Existing Streamable HTTP endpoint and metadata are characterized. | Preserved |
| FR-051 | Future tools declare annotations in the MCP adapter. | Deferred |
| FR-052 | MCP adapter owns future session expiration and cleanup. | Deferred |
| FR-053 | Safe errors use the existing text-result envelope. | Preserved |
| FR-060 | WebMCP runtime registration is deferred behind webmcp. | Deferred |
| FR-061 | Top-level browser registration belongs only in webmcp. | Deferred |
| FR-062 | Privileged actions remain backend-only. | Deferred |
| FR-063 | Browser state is a webmcp requirement. | Deferred |
| FR-064 | Unsupported-browser fallback is a webmcp/API contract. | Deferred |
| FR-070 | Audit events are core ports with future persistence adapters. | Deferred |
| FR-071 | Approval history is a versioned core/repository model. | Deferred |
| FR-073 | Actor/action/correlation are typed audit data. | Deferred |
| SEC-001 | Secrets are server-side configuration only. | Deferred |
| SEC-002 | Future backend adapters enforce authentication/authorization. | Deferred |
| SEC-003 | Least privilege is applied to adapters and credentials. | Deferred |
| SEC-004 | Adapter input validation is retained. | Preserved |
| SEC-005 | Untrusted external content stays data, not instructions. | Deferred |
| SEC-006 | Publish verification follows FR-026. | Deferred |
| SEC-007 | Adapter errors are safe and redact secrets. | Preserved |
| SEC-008 | Resilience belongs to future infrastructure adapters. | Deferred |
| SEC-009 | Clean install and CI quality gates are delivery controls. | Implemented |
| SEC-010 | The lockfile pins an MCP SDK release with known high-severity advisories; dependency remediation remains a release blocker. | Blocked |
| SEC-011 | Upstream license/provenance verification remains a release gate. | Deferred |

Before any future workflow ships, `src/evals` must contain normal, ambiguous, hostile-content, failed-upstream, approval-mismatch, and duplicate-topic regression data plus explicit correctness, safety, evidence, and duplicate-detection thresholds.
