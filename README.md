<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">

<h3 align="center">DEV.to MCP Server</h3>

  <p align="center">
    A read-only remote Model Context Protocol server for discovering public DEV.to content through the Forem API.
    <br />
    <a href="docs/README.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="docs/architecture/project-architecture.html">View Architecture</a>
    &middot;
    <a href="https://github.com/owezzy-tech/dev-to-mcp/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/owezzy-tech/dev-to-mcp/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#configuration">Configuration</a></li>
    <li><a href="#docker">Docker</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

[![Project architecture][product-screenshot]](docs/architecture/project-architecture.html)

DEV.to MCP Server exposes DEV.to's public API to MCP clients over Streamable HTTP. The current implementation is read-only, requires no DEV.to API key, and wraps public DEV.to responses in MCP text-content results.

The server currently provides six read-only tools:

- `get_articles`: list public articles with filters for username, tag, top window, pagination, and state
- `get_article`: retrieve one article by numeric ID or DEV.to path
- `get_user`: retrieve one public user by ID or username
- `get_tags`: list popular DEV.to tags
- `get_comments`: list comments for an article
- `search_articles`: search DEV.to feed content

This repository also includes architecture and requirements documentation for a planned approval-aware publishing platform. Planned publishing, persistence, retrieval, scheduling, and dashboard components are documented separately from the implemented read-only runtime.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [![Node.js][Node.js]][Node-url]
- [![TypeScript][TypeScript]][TypeScript-url]
- [![Express][Express.js]][Express-url]
- [![MCP SDK][MCP]][MCP-url]
- [![Vite][Vite]][Vite-url]
- [![Vitest][Vitest]][Vitest-url]
- [![Docker][Docker]][Docker-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

Follow these steps to run the MCP server locally from a clean checkout.

### Prerequisites

- Node.js 22 or newer
- npm
- Git
- Docker, only if you need to validate the image or future local data adapters

### Installation

1. Clone the repo.

   ```bash
   git clone https://github.com/owezzy-tech/dev-to-mcp.git
   cd dev-to-mcp
   ```

2. Install the locked dependency set.

   ```bash
   npm ci
   ```

3. Build the server.

   ```bash
   npm run build
   ```

4. Start the production entry point.

   ```bash
   npm start
   ```

5. Confirm the Streamable HTTP endpoint is reachable.

   ```bash
   curl http://127.0.0.1:3000/mcp
   ```

For a guided walkthrough, see the [getting-started tutorial](docs/tutorials/getting-started.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->

## Usage

Configure an MCP client that supports Streamable HTTP with this server URL:

```text
http://127.0.0.1:3000/mcp
```

The server advertises its tools during MCP initialization. Tool calls return JSON-stringified DEV.to responses in an MCP text-content envelope.

Example development flow:

```bash
npm run dev
```

Then point your MCP client at `http://127.0.0.1:3000/mcp` and call a read-only tool such as `get_articles`, `get_tags`, or `search_articles`.

For client configuration details, session behavior, and troubleshooting, see [Connect an MCP client](docs/how-to/connect-an-mcp-client.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Configuration

| Variable         | Default       | Accepted values or purpose                   |
| ---------------- | ------------- | -------------------------------------------- |
| `PORT`           | `3000`        | HTTP listening port                          |
| `NODE_ENV`       | `development` | `development`, `production`, or `test`       |
| `SERVER_NAME`    | `dev-to-mcp`  | Server name used by runtime configuration    |
| `SERVER_VERSION` | `1.0.0`       | Server version used by runtime configuration |
| `LOG_LEVEL`      | `info`        | `error`, `warn`, `info`, or `debug`          |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Docker

Build and run the MCP server image from source:

```bash
docker build -t dev-to-mcp .
docker run --rm -p 3000:3000 dev-to-mcp
```

The checked-in Compose file starts loopback-bound PostgreSQL/pgvector and Redis services reserved for future adapters. The current MCP server does not use those services and still runs separately.

```bash
docker compose up -d
docker compose ps
npm run dev
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Development

Common development and quality commands:

```bash
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npm run build
```

Tests use Vitest and live in the top-level `test/` directory. Runtime source lives in `src/` and builds to `dist/` through Vite.

Project documentation starts at [docs/README.md](docs/README.md):

- [Getting started](docs/tutorials/getting-started.md)
- [Connect an MCP client](docs/how-to/connect-an-mcp-client.md)
- [Architecture baseline](docs/reference/architecture-baseline.md)
- [Domain language](docs/explanation/domain-language.md)
- [Implementation plan](docs/explanation/implementation-plan.md)
- [Software requirements](docs/requirements/DEVto_Agent_Publishing_Platform_SRS.docx)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->

## Roadmap

Implemented:

- [x] Streamable HTTP MCP endpoint
- [x] Read-only DEV.to public API client
- [x] Article, user, tag, comment, and search tools
- [x] Architecture and contributor documentation

Planned and documented for future work:

- [ ] Approval-aware DEV.to publishing workflow
- [ ] Persistence adapters for future platform state
- [ ] Retrieval, scheduling, and dashboard capabilities
- [ ] Published container image and release automation

See the [open issues](https://github.com/owezzy-tech/dev-to-mcp/issues) and [implementation plan](docs/explanation/implementation-plan.md) for proposed features and known gaps.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->

## Contributing

Contributions are welcome. Keep changes focused, preserve the current read-only MCP contract unless the change explicitly updates it, and keep implemented behavior separate from planned architecture.

1. Fork the project.
2. Create a focused feature branch.
3. Install dependencies with `npm ci`.
4. Make the change and add or update tests when behavior changes.
5. Run the quality checks listed in [Development](#development).
6. Open a pull request with the behavior affected and checks performed.

Read the full [contributing guide](docs/CONTRIBUTING.md) before opening a pull request. Participation is governed by the [Code of Conduct](docs/CODE_OF_CONDUCT.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/owezzy-tech/dev-to-mcp/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=owezzy-tech/dev-to-mcp" alt="contrib.rocks image" />
</a>

<!-- LICENSE -->

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->

## Contact

Owen Adirah: [@owezzy-tech](https://github.com/owezzy-tech)

Project Link: [https://github.com/owezzy-tech/dev-to-mcp](https://github.com/owezzy-tech/dev-to-mcp)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [DEV Community](https://dev.to/) and the public [Forem API](https://developers.forem.com/api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Best README Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->

[contributors-shield]: https://img.shields.io/github/contributors/owezzy-tech/dev-to-mcp.svg?style=for-the-badge
[contributors-url]: https://github.com/owezzy-tech/dev-to-mcp/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/owezzy-tech/dev-to-mcp.svg?style=for-the-badge
[forks-url]: https://github.com/owezzy-tech/dev-to-mcp/network/members
[stars-shield]: https://img.shields.io/github/stars/owezzy-tech/dev-to-mcp.svg?style=for-the-badge
[stars-url]: https://github.com/owezzy-tech/dev-to-mcp/stargazers
[issues-shield]: https://img.shields.io/github/issues/owezzy-tech/dev-to-mcp.svg?style=for-the-badge
[issues-url]: https://github.com/owezzy-tech/dev-to-mcp/issues
[license-shield]: https://img.shields.io/github/license/owezzy-tech/dev-to-mcp.svg?style=for-the-badge
[license-url]: https://github.com/owezzy-tech/dev-to-mcp/blob/main/LICENSE
[product-screenshot]: docs/architecture/project-architecture.visual-check.1440x900.light.png
[Node.js]: https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[Node-url]: https://nodejs.org/
[TypeScript]: https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Express.js]: https://img.shields.io/badge/Express-5.1-000000?style=for-the-badge&logo=express&logoColor=white
[Express-url]: https://expressjs.com/
[MCP]: https://img.shields.io/badge/MCP-SDK_1.17-5A45FF?style=for-the-badge
[MCP-url]: https://modelcontextprotocol.io/
[Vite]: https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Vitest]: https://img.shields.io/badge/Vitest-3.x-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[Vitest-url]: https://vitest.dev/
[Docker]: https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
