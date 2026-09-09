# Getting started

This tutorial takes you from a clean checkout to a running DEV.to MCP server and a verified HTTP endpoint.

## What you will run

The current application is a read-only MCP server. It exposes six public-content tools over Streamable HTTP and calls the public DEV.to API without credentials.

## 1. Install prerequisites

Install Node.js 22 or newer and npm. Confirm both are available:

```bash
node --version
npm --version
```

## 2. Install dependencies

From the repository root, install the versions recorded in `package-lock.json`:

```bash
npm ci
```

## 3. Build the server

```bash
npm run build
```

The compiled entry point is written to `dist/index.js`.

## 4. Start the server

```bash
npm start
```

By default, the server listens on port 3000. Keep this terminal running.

## 5. Verify the endpoint

In another terminal, request the server metadata:

```bash
curl http://127.0.0.1:3000/mcp
```

You should receive JSON identifying `dev-to-mcp` and its `tools` capability.

## 6. Connect an MCP client

Add this Streamable HTTP endpoint to an MCP-compatible client:

```text
http://127.0.0.1:3000/mcp
```

After the client initializes a session, it can discover and call `get_articles`, `get_article`, `get_user`, `get_tags`, `get_comments`, and `search_articles`.

Continue with [Connect an MCP client](../how-to/connect-an-mcp-client.md) for configuration and troubleshooting details.

## 7. Stop the server

Press `Ctrl+C` in the server terminal.

## Next steps

- Read [Contributing](../CONTRIBUTING.md) before changing code.
- Explore the [current request sequence](../architecture/mcp-request-sequence.html).
- Review the [architecture baseline](../reference/architecture-baseline.md) to distinguish implemented behavior from planned work.
