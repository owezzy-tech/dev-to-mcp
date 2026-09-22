import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { ForemApiClient } from "./adapters/forem/forem-api-client.ts";
import { getConfig } from "./config.ts";
import { DiscoveryUseCases } from "./core/use-cases/discovery.ts";
import {
  currentCorrelationId,
  normalizeCorrelationId,
  withCorrelationId,
} from "./lib/correlation-id.ts";
import { HttpClient } from "./lib/http-client.ts";
import { logger } from "./logger.ts";
import { MCP_METADATA, buildMcpServer } from "./mcp/server.ts";
import { SessionRegistry } from "./mcp/session-registry.ts";
import { createToolHandlers } from "./mcp/tool-handlers.ts";
import { composeApp } from "./rest/compose.ts";
import { buildRestRouter } from "./rest/routes.ts";

const config = getConfig();

const app = express();
app.use(express.json());

const httpClient = new HttpClient({ logger });
const foremClient = new ForemApiClient(httpClient);
const useCases = new DiscoveryUseCases(foremClient, logger);
const handlers = createToolHandlers({
  useCases,
  logger,
  getCorrelationId: currentCorrelationId,
});
const sessions = new SessionRegistry();

app.get("/mcp", (_req: Request, res: Response) => {
  res.json(MCP_METADATA);
});

app.post("/mcp", async (req: Request, res: Response) => {
  const correlationId = normalizeCorrelationId(req.get("x-correlation-id"));
  res.setHeader("x-correlation-id", correlationId);

  await withCorrelationId(correlationId, async () => {
    const sessionId = req.get("mcp-session-id");

    if (sessionId !== undefined) {
      const transport = sessions.getAndTouch(sessionId);
      if (transport === undefined) {
        logger.warn({ correlationId, sessionId }, "session.unknown");
        res.status(404).json({ error: "Session not found" });
        return;
      }
      if (!(transport instanceof StreamableHTTPServerTransport)) {
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      logger.warn({ correlationId }, "session.missing");
      res
        .status(400)
        .json({ error: "Session ID required for non-initialization requests" });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        sessions.register(initializedSessionId, transport, () =>
          server.close(),
        );
      },
    });
    const server = buildMcpServer(handlers);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
});

app.delete("/mcp", async (req: Request, res: Response) => {
  const correlationId = normalizeCorrelationId(req.get("x-correlation-id"));
  res.setHeader("x-correlation-id", correlationId);

  await withCorrelationId(correlationId, async () => {
    const sessionId = req.get("mcp-session-id");
    if (sessionId === undefined || !sessions.has(sessionId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await sessions.close(sessionId);
    res.status(200).json({ message: "Session closed" });
  });
});

app.use(
  (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    logger.error(
      {
        correlationId: normalizeCorrelationId(req.get("x-correlation-id")),
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "http.request.failed",
    );
    res.status(500).json({ error: "Internal server error" });
  },
);

const port = config.PORT;

// Mount the versioned REST API when persistence is configured; the read-only
// MCP server remains available without a database.
if (config.DATABASE_URL !== undefined) {
  const deps = composeApp(config, logger);
  app.use("/v1", buildRestRouter(deps));
  logger.info({}, "Dev.to REST API mounted at /v1");
}

app.listen(port, () => {
  logger.info(
    { port, environment: config.NODE_ENV },
    "Dev.to MCP Server started",
  );
});
