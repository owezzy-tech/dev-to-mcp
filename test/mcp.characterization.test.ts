import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const mcpUrl = "http://127.0.0.1:3000/mcp";
const publicToolNames = [
  "get_articles",
  "get_article",
  "get_user",
  "get_tags",
  "get_comments",
  "search_articles",
] as const;

let server: ChildProcess | undefined;

async function waitForMcpEndpoint(): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(mcpUrl);
      if (response.status === 200) {
        return;
      }
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("MCP endpoint did not start within 10 seconds");
}

describe.sequential("public MCP baseline", () => {
  beforeAll(async () => {
    server = spawn(
      process.execPath,
      ["--experimental-strip-types", "src/index.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test" },
      },
    );

    await waitForMcpEndpoint();
  }, 15_000);

  afterAll(async () => {
    if (server?.exitCode === null) {
      server.kill("SIGTERM");
      await once(server, "exit");
    }
  });

  it("retains the HTTP metadata endpoint", async () => {
    const response = await fetch(mcpUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "dev-to-mcp",
      version: "1.0.0",
      description: "MCP server for dev.to public API",
      capabilities: ["tools"],
    });
  });

  it("retains public tool names and wire input schemas", async () => {
    const initializeResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "characterization", version: "1.0.0" },
        },
      }),
    });
    const sessionId = initializeResponse.headers.get("mcp-session-id");

    expect(initializeResponse.status).toBe(200);
    expect(sessionId).toBeTruthy();

    if (!sessionId) {
      throw new Error("MCP initialization did not return a session ID");
    }

    const toolsResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    const toolsBody = await toolsResponse.text();

    expect(toolsResponse.status).toBe(200);
    for (const toolName of publicToolNames) {
      expect(toolsBody).toContain(`"name":"${toolName}"`);
    }
    expect(toolsBody).toContain('"article_id":{"type":"number"');
    expect(toolsBody).toContain('"q":{"type":"string"');
    expect(toolsBody).toContain(
      '"state":{"type":"string","enum":["fresh","rising","all"]',
    );
    expect(toolsBody).toContain('"type":"object"');
    expect(toolsBody).toContain('"additionalProperties":false');
  });
});
