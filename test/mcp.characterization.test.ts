import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedTools } from "./fixtures/mcp-tools.js";

let server: ChildProcess | undefined;
let mcpUrl: string;

async function reservePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });

  const address = listener.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to reserve a TCP port");
  }

  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForMcpEndpoint(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let startupError: Error | undefined;
  let startupOutput = "";
  child.once("error", (error) => {
    startupError = error;
  });
  if (!child.stdout) {
    throw new Error("MCP server stdout is unavailable");
  }
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    startupOutput += chunk;
  });

  while (Date.now() < deadline) {
    if (startupError) {
      throw startupError;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `MCP server exited before startup (code=${child.exitCode}, signal=${child.signalCode})`,
      );
    }

    if (startupOutput.includes("Dev.to MCP Server started")) {
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
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("MCP endpoint did not start within 10 seconds");
}

function parseSseData(body: string): unknown {
  const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error("MCP response did not contain an SSE data event");
  }
  return JSON.parse(dataLine.slice(6)) as unknown;
}

describe.sequential("public MCP baseline", () => {
  beforeAll(async () => {
    const port = await reservePort();
    mcpUrl = `http://127.0.0.1:${port}/mcp`;
    server = spawn(
      process.execPath,
      ["--experimental-strip-types", "src/index.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test", PORT: String(port) },
      },
    );

    await waitForMcpEndpoint(server);
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
    expect(toolsResponse.status).toBe(200);
    expect(parseSseData(await toolsResponse.text())).toEqual({
      result: { tools: expectedTools },
      jsonrpc: "2.0",
      id: 2,
    });
    expect(server?.exitCode).toBeNull();
    expect(server?.signalCode).toBeNull();
  });
});
