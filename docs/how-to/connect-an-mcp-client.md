# Connect an MCP client

Use this guide to connect a client that supports the Model Context Protocol Streamable HTTP transport.

## Start the server

From the repository root:

```bash
npm ci
npm run build
npm start
```

The default MCP URL is:

```text
http://127.0.0.1:3000/mcp
```

Set `PORT` before starting the process if the client must use another local port:

```bash
PORT=4100 npm start
```

## Configure the client

MCP clients use different configuration file names, but the remote-server entry generally needs a name and URL. Adapt this generic shape to your client's documentation:

```json
{
  "mcpServers": {
    "dev-to": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Select Streamable HTTP when the client asks for a transport. Do not configure an API key for this server; all current tools use public DEV.to endpoints.

## Verify discovery

After connecting, the client should list these tools:

- `get_articles`
- `get_article`
- `get_user`
- `get_tags`
- `get_comments`
- `search_articles`

Try a read-only call such as listing the first few articles. The result is returned as JSON serialized inside an MCP text-content item.

## Understand session behavior

- The client initializes a session with a `POST /mcp` request.
- The server assigns an `mcp-session-id`.
- Subsequent requests must include that session ID.
- A non-initialization POST without a session ID returns HTTP 400.
- An unknown session ID returns HTTP 404.
- `GET /mcp` without a session ID returns server metadata and is a quick availability check.

See the [interactive request sequence](../architecture/mcp-request-sequence.html) for the complete flow.

## Troubleshoot

### The client cannot connect

Confirm the process is running and the URL includes `/mcp`:

```bash
curl http://127.0.0.1:3000/mcp
```

If you changed `PORT`, update the client URL to match.

### The server reports `Session ID required`

The client sent a normal MCP request before initialization. Reconnect or restart the client so it performs the initialize handshake first.

### The server reports `Session not found`

The server process no longer recognizes the client's session, commonly after a restart. Reconnect to create a new session.

### A DEV.to request fails

The current implementation propagates upstream tool failures through the MCP SDK. Check network access, the supplied article or user identifier, and the server logs. Never include credentials or sensitive data when sharing logs.
