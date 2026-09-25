# Deploying the DEV.to Agent Publishing Platform

The platform ships as a single Node.js process that serves the MCP endpoint,
the versioned REST API, and (when built) the Angular dashboard. PostgreSQL
(with pgvector) and Redis are the only external dependencies.

## Prerequisites

- Node.js 22+
- PostgreSQL 16 with the `pgvector` extension
- Redis 7

## 1. Build the image

```bash
docker build -t dev-to-mcp .
```

The image runs migrations at startup (via `npm run start`), serves MCP over
Streamable HTTP on port 3535, and exposes `/healthz`, `/readyz`, and `/metrics`.

## 2. Run with Docker Compose

```bash
cp .env.example .env       # set FOREM_API_KEY, MCP_BEARER_TOKEN, providers
docker compose up -d
```

`compose.yml` provides loopback-bound PostgreSQL (pgvector) and Redis. In a
hosted environment, point `DATABASE_URL` and `REDIS_URL` at managed services
instead.

## 3. Required environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL (pgvector) connection string |
| `REDIS_URL` | yes | Redis for rate limits, sessions, caching |
| `FOREM_API_KEY` | yes | DEV.to (Forem) API key, server-side only |
| `MCP_BEARER_TOKEN` | yes | trusted agent bearer token (≥16 chars) |
| `EMBEDDING_*` | no | vector search provider (degrades to full-text) |
| `GENERATION_*` | no | idea/draft generation provider |
| `TYPESAFE_*` | no | Jev judgment provider (degrades to deterministic) |
| `GITHUB_CLIENT_*` | no | dashboard OAuth (needed for the WebMCP dashboard) |

## 4. Build and serve the dashboard

```bash
cd dashboard && npm ci && npm run build
```

The backend serves `dashboard/dist/dashboard/browser` automatically when
present.

## 5. Health and operations

```bash
curl http://localhost:3535/healthz   # 200 liveness
curl http://localhost:3535/readyz    # 200 when DATABASE_URL is configured
curl http://localhost:3535/metrics   # Prometheus text format
```

Logs, the `x-correlation-id` response header, audit events, and the request
counter all share the same correlation id, so an operator can join a request
across logs, traces, and metrics.
