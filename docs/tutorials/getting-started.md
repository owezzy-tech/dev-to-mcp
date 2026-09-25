# Getting started locally

This tutorial takes a developer from a clean checkout to a working local MCP
server. It then shows how to add the PostgreSQL/pgvector and Redis services
used by the persisted platform.

## What you will run

There are two useful local modes:

1. **Public MCP mode** — Node.js only; reads public DEV.to content.
2. **Full platform mode** — Docker Compose plus Prisma; adds `/v1`, persistence,
   retrieval, workflow state, and the dashboard bundle.

## Prerequisites

Install Node.js 22 or newer, npm, Git, and Docker Desktop if you want full
platform mode.

```bash
node --version
npm --version
docker --version
```

## Run public MCP mode

From the repository root:

```bash
npm ci
npm run dev
```

In another terminal, verify liveness and metadata:

```bash
curl http://127.0.0.1:3535/healthz
curl http://127.0.0.1:3535/mcp
```

Point an MCP client at:

```text
http://127.0.0.1:3535/mcp
```

The client initializes a Streamable HTTP session and discovers the public
tools. Continue with [Connect an MCP client](../how-to/connect-an-mcp-client.md)
for the session contract.

## Add the full local platform

### Start dependencies

```bash
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

The default services are loopback-bound at PostgreSQL `5432` and Redis `6379`.
If those ports are occupied, set `POSTGRES_PORT` and `REDIS_PORT` before the
Compose command.

### Configure environment

```bash
export DATABASE_URL='postgresql://dev_to_mcp:dev_to_mcp_local@127.0.0.1:5432/dev_to_mcp'
export REDIS_URL='redis://127.0.0.1:6379'
```

Apply migrations:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

Restart `npm run dev`. The server now mounts the versioned REST API at
`/v1`, and `/readyz` reports ready.

```bash
curl http://127.0.0.1:3535/readyz
curl http://127.0.0.1:3535/metrics
```

### Build the dashboard

The dashboard is a separate Angular workspace:

```bash
cd dashboard
npm ci
npm run build
cd ..
npm run build
npm start
```

When `dashboard/dist/dashboard/browser` exists, the root server serves it at
`http://127.0.0.1:3535/`. The dashboard calls `/v1`; authenticated routes need
a valid dashboard session. The repository does not currently include a local
login/session-creation screen, so public MCP mode is the recommended first
smoke test.

## Optional model and publishing providers

The server starts without model credentials. Add provider keys only when
testing those capabilities:

```bash
export FOREM_API_KEY='...'
export EMBEDDING_API_KEY='...'
export GENERATION_API_KEY='...'
export TYPESAFE_API_KEY='...'
```

Keys stay in the server environment. They are never sent to the browser or
embedded in prompts as user content.

## Stop local services

```bash
docker compose -f compose.yml down
```

Add `-v` only when you intentionally want to delete the local PostgreSQL and
Redis volumes.

## Next steps

- [Connect an MCP client](../how-to/connect-an-mcp-client.md)
- [Deployment guide](../how-to/deploy.md)
- [Local setup sequence diagram](../architecture/local-setup.html)
- [Architecture baseline](../reference/architecture-baseline.md)
