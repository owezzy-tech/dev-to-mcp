# DEV.to Agent Publishing Platform Implementation Plan

## Objective

Evolve the current read-only TypeScript DEV.to MCP server into a production-minded, single-author publishing platform that exposes one validated application core through Streamable HTTP MCP, a REST API, and an Angular WebMCP dashboard.

The delivery target is the complete SRS, with MCP and authenticated publishing as the foundation and WebMCP as a progressive-enhancement interface. No scheduler, agent, retrieved document, or browser action may publish without a server-side approval for the exact draft version.

## Settled architecture decisions

- Single author/owner for the first release; all persisted records still carry an owner boundary.
- Angular standalone dashboard in the same repository; WebMCP is feature-detected and optional.
- PostgreSQL with Prisma migrations and custom `pgvector` SQL for embeddings and similarity indexes.
- Redis for distributed rate limits, short-lived cache/session data, and coordination; PostgreSQL remains the durable source of truth.
- Provider-agnostic model and embedding interfaces with an OpenAI-compatible default configured only on the server.
- Versioned JSON REST endpoints for the dashboard; MCP and REST adapters call the same application handlers.
- PostgreSQL-backed workflow state machine with a separate worker, leases/advisory locks, idempotency keys, retry metadata, and persisted transitions.
- Hybrid retrieval: PostgreSQL full-text search plus `pgvector`, followed by ranking for similarity, recency, reactions, comments, configured topic relevance, and duplication risk.
- Vitest is the mandatory evaluation and release-gate runner; LangSmith is optional for tracing and exploratory quality experiments.
- Pino plus OpenTelemetry-compatible tracing and Prometheus metrics; exporters remain configurable.
- Provider-neutral transactional email for draft-ready, publish-success, and publish-failure notifications.

## Delivery phases

### 0. Baseline and product contracts

Confirm upstream license compatibility, record the current API behavior, define typed domain objects, error categories, correlation IDs, configuration boundaries, and the SRS traceability matrix. Establish the Angular workspace, local Docker Compose services, Prisma migration workflow, and CI quality gates before feature work.

### 1. Shared core and public discovery

Move the existing API client and MCP registration behind `src/core`, `src/mcp`, and shared Zod schemas. Normalize Forem responses, enforce pagination and input limits, preserve all public read tools, normalize safe errors, and add timeout/retry behavior. MCP session expiry and cleanup must be explicit.

### 2. Persistence, identity, and security foundations

Add Prisma models and migrations for the single author, configuration, article snapshots, drafts, versions, approvals, workflow runs, audit events, evaluations, and embeddings. Implement GitHub OAuth/OIDC dashboard sessions and separate trusted MCP bearer-token authentication. Add secret redaction, authorization boundaries, rate limiting, request size limits, and security-focused tests.

### 3. Authenticated article management

Implement the authenticated Forem client with server-side API-key handling and supported version headers. Add list-my-articles, create-draft, update-draft, and publish handlers. Every edit creates a version and invalidates approvals; publishing verifies actor, authorization, approval expiry, content hash, draft version, idempotency key, and current lifecycle state.

### 4. Workflow and audit engine

Implement the required lifecycle from `RESEARCHING` through `PUBLISHED` or `FAILED`. Persist every transition and material tool event with correlation ID, actor type, sanitized inputs, outcome, resource, and version. Add a worker with leases, retry/backoff, recovery after restart, duplicate prevention, and no-publish outcomes.

### 5. Retrieval and content intelligence

Cache normalized public article snapshots, generate embeddings through the provider adapter, and index them in PostgreSQL. Implement hybrid search, configurable ranking, author-history comparison, duplication detection, evidence-backed content-gap analysis, and hostile-content boundaries. Retrieval output must be evidence-oriented and must never be treated as instructions.

### 6. AI-assisted drafting

Add research-grounded idea generation and Markdown drafting with citations or explicit verification markers. Add deterministic linting for duplicate content, unsupported claims, broken links, missing code context, prohibited content, and false personal-experience claims. Support revision requests, manual edits, approval, rejection, discard, and approval invalidation.

### 7. REST API and Angular dashboard

Expose versioned REST routes for authentication, discovery, ideas, drafts, approvals, publishing, workflow status, audit history, and available analytics. Build an accessible dashboard showing capabilities, agent actions, research evidence, ideas, draft preview, approval state, and audit events. WebMCP registration must update both structured tool results and visible state, while unsupported browsers receive clear guidance.

### 8. Scheduling, notifications, and analytics

Add an external-scheduler-triggered authenticated workflow endpoint, weekly topic configuration, no-publish reporting, email notifications, and post-publication performance collection where supported. Scheduling can initiate research and drafting but cannot grant publish authority.

### 9. Evaluation, operations, and release hardening

Create versioned Vitest datasets and graders for normal, ambiguous, hostile, failed-upstream, duplicate-topic, approval-mismatch, replay, and authorization-bypass cases. Add protocol, browser, integration, security, performance, accessibility, dependency, and container checks. Add OpenTelemetry correlation, metrics, dashboards/runbooks, health checks, deployment documentation, architecture notes, and the 90-second demonstration script.

## Definition of done

The release is complete when the SRS MVP acceptance criteria and all Must requirements are traceable to implemented behavior and automated tests; MCP and WebMCP call the same handlers; a compatible browser can demonstrate research through safe publication; publish bypasses are blocked at 100% in the critical evaluation suite; audit history is sanitized and correlated; the application recovers workflow state after restart; and local Docker plus hosted deployment instructions are reproducible.

Should-level requirements—post-publication analytics and notifications—are implemented behind clear capability checks where the Forem API or provider cannot support them. WebMCP and LangSmith remain optional at runtime and must not block core MCP publishing workflows.
