# DEV.to MCP Server

An MCP-first DEV.to agent publishing platform. It exposes public DEV.to
discovery tools over Streamable HTTP and, when persistence is configured,
mounts a versioned REST API and Angular dashboard for retrieval, drafting,
approval-aware workflows, scheduling, audit history, and publishing.

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#full-local-platform">Full local platform</a></li>
    <li><a href="#development-commands">Development commands</a></li>
    <li><a href="#docker">Docker</a></li>
    <li><a href="#documentation-map">Documentation map</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

[![Project architecture](docs/architecture/project-architecture.visual-check.1440x900.light.png)](docs/architecture/project-architecture.html)

The adapters converge on one shared core. MCP and REST do not duplicate
business policy; the workflow engine enforces approval, version/hash matching,
leases, retries, audit records, and the rule that scheduling cannot publish.

- [Current platform architecture](docs/architecture/platform-architecture.v3.html)
- [Local setup and MCP request flow](docs/architecture/local-setup.v3.html)
- [Draft lifecycle](docs/architecture/draft-lifecycle.html)
- [Architecture catalog](docs/architecture/README.md)
- [Architecture baseline and SRS traceability](docs/reference/architecture-baseline.md)

### Built With

- Node.js 22+ and TypeScript
- Express and the Model Context Protocol SDK
- Prisma with PostgreSQL/pgvector, and Redis
- Angular (dashboard)
- Vite, Vitest, and Docker

## Getting Started

The public MCP path does not require PostgreSQL, Redis, an API key, or a model
provider. A clean checkout can be running in under a minute.

### Prerequisites

- Node.js 22 or newer
- npm
- Network access to `https://dev.to`

### Installation

```bash
git clone https://github.com/owezzy-tech/dev-to-mcp.git
cd dev-to-mcp
npm ci
npm run dev
```

The development server listens on `http://127.0.0.1:3535` by default. Verify
it in another terminal:

```bash
curl http://127.0.0.1:3535/healthz
curl http://127.0.0.1:3535/mcp
```

To run the MCP server as a local container instead, use the `mcp` Compose
service. It needs no database and restarts with Docker:

```bash
docker compose up -d --build mcp
```

## Usage

Configure an MCP client with this Streamable HTTP URL:

```text
http://127.0.0.1:3535/mcp
```

The public tools are:

- `get_articles`
- `get_article`
- `get_user`
- `get_tags`
- `get_comments`
- `search_articles`

DEV.to retired its public search endpoint, so `search_articles` queries the
Algolia index behind the DEV.to site search, using the public search-only key
published on `https://dev.to/search`. Results omit `description`.

See [Connect an MCP client](docs/how-to/connect-an-mcp-client.md) for the
initialization/session contract and client configuration example.

## Full local platform

Use the full stack when you need the REST API, dashboard, drafts, retrieval,
workflow persistence, or pgvector integration.

### 1. Start PostgreSQL/pgvector and Redis

Docker Desktop (or another Docker Engine with Compose) is required.

```bash
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

The Compose services bind to loopback only:

```text
PostgreSQL: 127.0.0.1:5432
Redis:      127.0.0.1:6379
```

If either port is already in use, choose another host port:

```bash
POSTGRES_PORT=55432 REDIS_PORT=56379 docker compose -f compose.yml up -d
```

Use matching URLs in the environment below.

### 2. Configure the server

Create a local shell environment. Do not commit this file or real secrets.

```bash
export DATABASE_URL='postgresql://dev_to_mcp:dev_to_mcp_local@127.0.0.1:5432/dev_to_mcp'
export REDIS_URL='redis://127.0.0.1:6379'
export MCP_BEARER_TOKEN='replace-with-at-least-16-random-characters'
```

The MCP discovery path remains public. `MCP_BEARER_TOKEN` is reserved for
authenticated deployments and must not be placed in browser code or an MCP
client configuration unless the deployment explicitly requires it.

Apply the checked-in migrations and generate the Prisma client:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

### 3. Run the server and dashboard

Run the API in one terminal:

```bash
npm run dev
```

Build the Angular dashboard in another terminal:

```bash
cd dashboard
npm ci
npm start
```

For a production-style single process, build the dashboard and root server:

```bash
cd dashboard && npm ci && npm run build
cd ..
npm run build
npm start
```

The root server serves the dashboard bundle at `/` when
`dashboard/dist/dashboard/browser` exists. The API is mounted at `/v1` when
`DATABASE_URL` is configured.

Useful probes:

```bash
curl http://127.0.0.1:3535/healthz
curl http://127.0.0.1:3535/readyz
curl http://127.0.0.1:3535/metrics
```

`/readyz` returns success only when `DATABASE_URL` is configured. Authenticated
`/v1` routes require a valid dashboard session; a local session/login UI is not
currently included, so public MCP discovery is the simplest first verification.

### Optional providers

The platform uses provider ports and falls back to null adapters when keys are
absent. Configure only the capabilities you need:

```bash
export FOREM_API_KEY='...'                 # authenticated DEV.to writes
export EMBEDDING_API_KEY='...'             # hybrid retrieval vectors
export EMBEDDING_BASE_URL='https://api.openai.com'
export GENERATION_API_KEY='...'            # idea and draft generation
export GENERATION_BASE_URL='https://api.openai.com'
export TYPESAFE_API_KEY='...'              # Jev duplication/gap/safety judgments
export TYPESAFE_BASE_URL='https://api.typesafe.ai'
```

Provider keys are read only by the server. Never put them in `dashboard/` or
commit them to the repository.

## Development commands

```bash
npm run dev                 # watch the TypeScript server
npm run build               # build the root server
npm run typecheck           # TypeScript validation
npm run lint                # ESLint
npm run format:check        # Prettier check
npm run test:ci             # root Vitest suite
npm run eval                # critical safety evaluations
npm run prisma:migrate:dev  # create a development migration
```

Dashboard commands run from `dashboard/`:

```bash
npm ci
npm start
npm run build
npm run test:ci
```

## Docker

Build and run the server image with Compose (image `dev-to-mcp:local`,
bound to `127.0.0.1:3535`; set `MCP_PORT` to change the host port):

```bash
npm run docker:mcp
```

This rebuilds the image and recreates the container, so it always runs the
current code, then waits until the healthcheck passes.

Or with plain Docker:

```bash
docker build -t dev-to-mcp:local .
docker run -d --name dev-to-mcp -p 127.0.0.1:3535:3535 dev-to-mcp:local
```

The image contains the root server. It does not provision PostgreSQL or Redis;
provide those services separately and pass `DATABASE_URL`/`REDIS_URL` when
running the full platform.

## Documentation map

- [Getting started tutorial](docs/tutorials/getting-started.md)
- [Connect an MCP client](docs/how-to/connect-an-mcp-client.md)
- [Deployment guide](docs/how-to/deploy.md)
- [REST boundary](src/rest/README.md)
- [MCP adapter](src/mcp/README.md)
- [Domain language](docs/explanation/domain-language.md)
- [Implementation plan](docs/explanation/implementation-plan.md)
- [Contributing](docs/CONTRIBUTING.md)

## Roadmap

Implemented:

- [x] Streamable HTTP MCP endpoint with public DEV.to discovery tools
- [x] Versioned REST API, Angular dashboard, and WebMCP adapter
- [x] Retrieval, drafting, approval-aware workflows, and scheduling
- [x] Critical evaluations, observability, and release gates

See the [open issues](https://github.com/owezzy-tech/dev-to-mcp/issues) and
[implementation plan](docs/explanation/implementation-plan.md) for proposed
features and known gaps.

## Contributing

Contributions are welcome. Keep changes focused and add or update tests when
behavior changes.

1. Fork the project.
2. Create a focused feature branch.
3. Install dependencies with `npm ci`.
4. Make the change and run the checks in [Development commands](#development-commands).
5. Open a pull request with the behavior affected and checks performed.

Read the full [contributing guide](docs/CONTRIBUTING.md) before opening a pull
request. Participation is governed by the
[Code of Conduct](docs/CODE_OF_CONDUCT.md).

### Top contributors:

<a href="https://github.com/owezzy-tech/dev-to-mcp/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=owezzy-tech/dev-to-mcp" alt="contrib.rocks image" />
</a>

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## Contact

Owen Adirah: [@owezzy-tech](https://github.com/owezzy-tech)

Project Link: [https://github.com/owezzy-tech/dev-to-mcp](https://github.com/owezzy-tech/dev-to-mcp)

## Acknowledgments

- [DEV Community](https://dev.to/) and the public [Forem API](https://developers.forem.com/api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Best README Template](https://github.com/othneildrew/Best-README-Template)
