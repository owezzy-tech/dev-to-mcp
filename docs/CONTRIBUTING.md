# Contributing to dev-to-mcp

Thank you for improving the DEV.to MCP server. This guide gets a new contributor from a clean checkout to a reviewable pull request.

## Code of Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Report unacceptable behavior to nick@nickyt.co.

## Before you begin

Install:

- Git
- Node.js 22 or newer
- npm
- Docker only if you need to validate the image or future local data adapters

The implemented product is currently a read-only Streamable HTTP MCP server. The publishing platform, persistence, retrieval, scheduling, and dashboard described in the architecture documents are planned work, not current runtime behavior.

## Set up a development checkout

1. Fork and clone the repository.
2. Create a focused branch from the pull request's target branch.
3. Install exactly the dependency versions recorded in the lockfile.

```bash
npm ci
```

4. Start the development server.

```bash
npm run dev
```

5. Verify the metadata endpoint in another terminal.

```bash
curl http://127.0.0.1:3000/mcp
```

## Understand the change boundary

Before editing runtime behavior, read:

- [Architecture baseline](reference/architecture-baseline.md) for current contracts and deferred boundaries
- [Domain language](explanation/domain-language.md) for project terminology
- [Architecture artifacts](architecture/README.md) for interactive system views
- [Implementation plan](explanation/implementation-plan.md) for planned delivery phases

Preserve the six public tool names, their input schemas, their read/open-world annotations, and the MCP text-result envelope unless the change explicitly updates that public contract.

## Run quality checks

Run the same checks as CI before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npm run build
npm audit --omit=dev --audit-level=high
```

If the change affects the container, also run:

```bash
docker build -t dev-to-mcp:local .
docker run --rm -p 3000:3000 dev-to-mcp:local
```

## Write focused changes

- Match the existing TypeScript, Vitest, ESLint, and Prettier conventions.
- Add or update tests when changing a behavioral contract.
- Keep current behavior separate from planned architecture in code and documentation.
- Do not add credentials, tokens, production data, or deployment secrets.
- Do not claim redistribution rights while the repository-level license remains unverified.

## Open a pull request

Include:

- What changed and why
- The user-visible or protocol behavior affected
- Tests and manual checks performed
- Any known limitation or follow-up
- Screenshots only when a visual artifact changed

Keep each pull request focused enough that a reviewer can validate and revert it independently.

## Report an issue

Include:

- A clear problem statement
- Reproduction steps
- Expected and actual behavior
- Relevant logs with credentials and personal data removed
- Node.js version and operating system

Open an issue for design discussion before starting a change that alters the MCP contract or a settled architecture boundary.
