# Workflow boundary

`workflows` will coordinate explicit approval-aware use cases through core ports. It contains no scheduler or autonomous publishing implementation.

The durable mechanics live in the application core so every adapter shares them:

- `src/core/policies/lifecycle.ts` — the authoritative draft state machine. It lists every valid `WorkflowState` transition with the actor classes allowed to make it, and it is the only place that decides whether a transition is legal. No transition into `PUBLISHING` is reachable by `SCHEDULER`.
- `src/core/policies/scheduling.ts` — bounded retry, exponential backoff, and lease duration policy.
- `src/core/use-cases/workflow-engine.ts` — lease-based advancement, restart recovery, no-publish reporting, and chronological audit access.
- `src/core/ports/workflow-repository.ts` — persistence port (claim/release leases, transitions, no-publish reports, audit queries).
- `src/adapters/persistence/prisma-workflow-repository.ts` — PostgreSQL implementation. Claim acquisition is atomic: a conditional update guarded by a `pg_advisory_xact_lock` ensures two workers can never hold the same lease.

Scheduling itself (the external trigger that starts research runs) is the remaining piece of this boundary and is tracked separately. Whatever starts a run, it can only move a draft through transitions that `lifecycle.ts` permits for the `SCHEDULER` actor, and it can never publish.
