# Connect an MCP client

Use this guide to connect a client that supports the Model Context Protocol
Streamable HTTP transport.

## Start the server

For public discovery, no database or API key is required:

```bash
npm ci
npm run dev
```

The endpoint is:

```text
http://127.0.0.1:3535/mcp
```

Set `PORT` if required:

```bash
PORT=4100 npm run dev
```

## Configure the client

Adapt this generic shape to the client's configuration format:

```json
{
  "mcpServers": {
    "dev-to": {
      "url": "http://127.0.0.1:3535/mcp"
    }
  }
}
```

Select Streamable HTTP. Public discovery does not require an API key. Do not
copy server-side provider keys into the client configuration.

## Verify discovery

The client should discover:

- `get_articles`
- `get_article`
- `get_user`
- `get_tags`
- `get_comments`
- `search_articles`

Try `get_articles` or `search_articles`. Results are JSON serialized inside an
MCP text-content item.

## Understand sessions

- `GET /mcp` returns server metadata and is a quick availability check.
- The client initializes a session with `POST /mcp`.
- The server returns an `mcp-session-id`.
- Subsequent MCP requests include that header.
- A non-initialization request without a session ID returns HTTP 400.
- An unknown session ID returns HTTP 404.
- `DELETE /mcp` closes a known session.

The session is held in the server process and is lost when the process restarts.
See the [request sequence diagram](../architecture/mcp-request-sequence.html).

## Troubleshoot

### The client cannot connect

Check the process and endpoint:

```bash
curl http://127.0.0.1:3535/healthz
curl http://127.0.0.1:3535/mcp
```

If `PORT` changed, update the client URL too.

### `Session ID required`

The client sent a normal MCP request before initialization. Reconnect so it
performs the initialize handshake first.

### `Session not found`

The server restarted or the client supplied an old session ID. Reconnect.

### A DEV.to request fails

Check network access and the article, user, or tag input. Inspect server logs
without sharing credentials or sensitive request data.
