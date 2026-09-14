# dev-to-mcp-4tw-1 - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A contract-first repository baseline: documented architecture and SRS traceability, stable future source boundaries, reproducible PostgreSQL/Redis local services, and CI quality gates that protect the existing MCP server.

**Why this approach:** Establishing interfaces and release gates before feature work reduces migration risk while preserving the current public MCP behavior.

**What it will NOT do:** It will not add publishing, persistence, authentication, retrieval, scheduling, model calls, or dashboard behavior yet.

**Effort:** Short
**Risk:** Medium - source-boundary and CI changes touch the whole repository.
**Decisions to sanity-check:** preserve current MCP behavior; keep local services declarative until their implementation tasks; document license verification as a release gate.

Your next move: delegate Todo 1, then independently verify its evidence before claiming completion.

---

> TL;DR (machine): Short/medium risk; add architecture contracts, local service scaffolding, CI gates, and baseline preservation for the existing MCP server.

## Scope
### Must have
- Architecture decision record and SRS Must traceability.
- Stable source-boundary contracts for core, MCP, WebMCP, workflows, and evaluations.
- Docker Compose service definitions for PostgreSQL/pgvector and Redis with health checks.
- Typecheck, lint, format, test, build, and CI gates.
- Existing behavior characterization and real HTTP smoke evidence.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- No later-phase publishing, auth, persistence implementation, retrieval, scheduling, model, or Angular UI code.
- No weakening or deletion of tests.
- No changes to unrelated dirty files.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after for additive scaffolding, characterization-first for existing MCP behavior, using Vitest.
- Evidence: `.omo/evidence/task-1-dev-to-mcp-4tw-1.md`.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
Wave 1 contains the single atomic baseline task; this is intentionally unsplit because all deliverables share the package/CI/source-boundary contract.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | later Beads tasks `.2`-`.10` | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Establish architecture baseline and delivery contracts
  What to do / Must NOT do: Add architecture decision/traceability documentation, stable future source boundaries, local PostgreSQL/pgvector and Redis Compose services, CI workflow, and package quality scripts. Preserve existing public MCP tool names, inputs, output envelope, and runtime endpoint behavior. Do not implement later-phase domain logic or overwrite unrelated user files.
  Parallelization: Wave 1 | Blocked by: none | Blocks: later Beads tasks `dev-to-mcp-4tw.2` through `.10`
  References (executor has NO interview context - be exhaustive): `package.json`; `src/index.ts`; `src/devto-api.ts`; `src/config.ts`; `Dockerfile`; `README.md`; `CONTRIBUTING.md`; `.github/copilot-instructions.md`; `docs/IMPLEMENTATION_PLAN.md`; SRS sections 2, 4, 9, 10, 12, and 13.
  Acceptance criteria (agent-executable): `npm ci`; `npm run typecheck`; `npm run lint`; `npm run format:check`; `npm run test:ci`; `npm run build`; CI workflow syntax is valid; Compose configuration parses and both declared services have health checks; architecture and traceability docs identify all SRS Must requirements and their owning phase; existing public read tests and MCP response shape remain passing.
  QA scenarios (name the exact tool + invocation): happy: start with `npm run dev`, then `curl -i http://127.0.0.1:3000/mcp` and confirm an HTTP response from the MCP endpoint; failure: run `npm run typecheck` with an invalid `PORT` only in a child shell and confirm configuration failure is actionable, then remove the temporary override. Evidence `.omo/evidence/task-1-dev-to-mcp-4tw-1.md`.
  Commit: Y | `chore(baseline): establish architecture and delivery contracts`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy
One focused commit for the baseline scaffolding and contract documentation. Do not include pre-existing `.idea/` or unrelated `docs/` changes.

## Success criteria
Todo 1 is complete only after the worker's implementation, automated gates, real HTTP smoke test, adversarial checks, cleanup receipt, and independent reviewer confirmation are recorded in `.omo/start-work/ledger.jsonl` and the task is ready to hand off to `dev-to-mcp-4tw.2`.
