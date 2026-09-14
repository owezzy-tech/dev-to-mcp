---
slug: dev-to-mcp-4tw-1
status: executing
intent: clear
review_required: false
pending-action: execute todo 1 through delegated worker
approach: Establish the repository contracts and delivery scaffolding without changing externally observable public MCP behavior.
---

# Draft: dev-to-mcp-4tw-1

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| contracts | typed source boundaries, SRS traceability, and architecture decisions | active | .omo/start-work/ledger.jsonl |
| delivery | local services, CI gates, and reproducible developer commands | active | .omo/start-work/ledger.jsonl |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| dashboard packaging | reserve `apps/dashboard` for the Angular app and keep the current service at the repository root | avoids premature transport coupling while providing a stable future boundary | yes |
| local services | Docker Compose PostgreSQL + pgvector and Redis placeholders with health checks | matches the approved architecture without implementing later features in this task | yes |
| license | document the current MIT metadata and flag upstream verification as a release gate | SRS SEC-011 requires verification before redistribution | yes |

## Findings (cited - path:lines)

- `package.json`: current scripts are build/dev/start/test/lint/format only; no typecheck or CI script exists.
- `src/index.ts`: MCP registration, HTTP transport, and public tools are currently coupled in one entry point.
- `src/devto-api.ts`: public API calls are untyped `unknown` responses and use the direct Forem URL.
- `Dockerfile`: production build exists, but no local PostgreSQL/Redis development topology is defined.
- `README.md`, `CONTRIBUTING.md`, `.github/copilot-instructions.md`: existing commands and contributor expectations must remain valid during the baseline migration.
- `docs/IMPLEMENTATION_PLAN.md`: approved architecture decisions and phase boundaries for this task.

## Decisions (with rationale)

- Keep this task additive and contract-first: do not implement authenticated publishing, persistence, Angular UI, retrieval, or workflow behavior yet.
- Introduce stable directory ownership and interface contracts before moving business logic in later tasks.
- Add typecheck and CI gates now so later cross-cutting changes cannot silently bypass strict TypeScript checks.

## Scope IN

- Architecture note and SRS requirement traceability for the repository.
- Stable source boundaries for `src/core`, `src/mcp`, `src/webmcp`, `src/workflows`, and `src/evals` without speculative business implementations.
- Reproducible local service configuration and health checks for PostgreSQL/pgvector and Redis.
- CI workflow and package scripts for install, typecheck, lint, format check, tests, and build.
- Baseline characterization coverage for the existing public read behavior.

## Scope OUT (Must NOT have)

- No DEV.to write calls, API-key handling, OAuth, database schema, Redis client code, embeddings, model calls, scheduler, dashboard UI, or WebMCP runtime registration.
- No deletion or weakening of existing tests.
- No overwrite of existing user changes in `.idea/` or `docs/`.

## Open questions

## Approval gate
status: executing
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
