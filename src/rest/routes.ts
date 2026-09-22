import { Router, type Request, type Response } from "express";
import { normalizeCorrelationId } from "../lib/correlation-id.ts";
import type { AppDependencies } from "./compose.ts";
import { requireAuthor, authorOf } from "./auth.ts";
import { sendError } from "./errors.ts";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

function wrap(handler: Handler) {
  return async (req: Request, res: Response): Promise<void> => {
    const correlationId = normalizeCorrelationId(req.get("x-correlation-id"));
    res.setHeader("x-correlation-id", correlationId);
    try {
      const body = await handler(req, res);
      if (body !== undefined && !res.headersSent) {
        res.json(body);
      }
    } catch (error) {
      sendError(res, error, correlationId);
    }
  };
}

function int(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Versioned REST API over the shared application handlers. Public discovery
 * routes need no auth; every write, AI, and management route requires a
 * validated author session (FR-061 keeps credentials server-side).
 */
export function buildRestRouter(deps: AppDependencies): Router {
  const router = Router();
  const auth = requireAuthor(deps.authorResolver);

  // ── Public discovery ────────────────────────────────────────────────
  router.get(
    "/articles",
    wrap((req) =>
      deps.discovery.listArticles(
        {
          page: int(req.query.page, 1),
          per_page: int(req.query.per_page, 30),
          ...(req.query.tag === undefined
            ? {}
            : { tag: String(req.query.tag) }),
          ...(req.query.username === undefined
            ? {}
            : { username: String(req.query.username) }),
          ...(req.query.top === undefined
            ? {}
            : { top: int(req.query.top, 1) }),
        },
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/articles/:id",
    wrap((req) =>
      deps.discovery.getArticle(
        { id: int(req.params.id, 0) },
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/search",
    wrap((req) =>
      deps.discovery.searchArticles(
        {
          q: String(req.query.q ?? ""),
          page: int(req.query.page, 1),
          per_page: int(req.query.per_page, 30),
        },
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/tags",
    wrap((req) =>
      deps.discovery.listTags(
        int(req.query.page, 1),
        int(req.query.per_page, 30),
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/comments/:articleId",
    wrap((req) =>
      deps.discovery.listComments(
        int(req.params.articleId, 0),
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/users/:username",
    wrap((req) =>
      deps.discovery.getUser(
        { username: String(req.params.username) },
        currentCorrelation(req),
      ),
    ),
  );

  // ── Authenticated: capabilities and inventory ────────────────────────
  router.get(
    "/me/capabilities",
    auth,
    wrap((_req, res) => deps.repository.getCapabilities(authorOf(res))),
  );

  router.get(
    "/me/articles",
    auth,
    wrap((req, res) =>
      deps.articles.listMyArticles(
        authorOf(res),
        normalizeForemState(req.query.state),
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/me/drafts",
    auth,
    wrap((_req, res) => deps.repository.listDrafts(authorOf(res))),
  );

  // ── Retrieval and ideation ───────────────────────────────────────────
  router.post(
    "/ideas",
    auth,
    wrap((req) =>
      deps.drafting.generateIdeas(
        {
          topic: String(req.body.topic ?? ""),
          evidence: req.body.evidence ?? [],
          count: int(req.body.count, 3),
        },
        currentCorrelation(req),
      ),
    ),
  );

  router.get(
    "/retrieval/search",
    auth,
    wrap((req) =>
      deps.retrieval.hybridSearch(
        String(req.query.q ?? ""),
        {
          limit: int(req.query.limit, 20),
          ...(req.query.topics === undefined
            ? {}
            : {
                configuredTopics: String(req.query.topics)
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0),
              }),
        },
        currentCorrelation(req),
      ),
    ),
  );

  router.post(
    "/retrieval/duplication",
    auth,
    wrap((req, res) =>
      deps.retrieval.detectDuplication(
        {
          title: String(req.body.title ?? ""),
          tags: req.body.tags ?? [],
          description: req.body.description ?? null,
        },
        authorOf(res),
        currentCorrelation(req),
      ),
    ),
  );

  router.post(
    "/gap",
    auth,
    wrap((req) =>
      deps.retrieval.analyzeContentGap(
        String(req.body.query ?? ""),
        currentCorrelation(req),
      ),
    ),
  );

  // ── Drafting ─────────────────────────────────────────────────────────
  router.post(
    "/drafts/generate",
    auth,
    wrap((req) =>
      deps.drafting.generateDraft(
        {
          idea: {
            title: String(req.body.idea?.title ?? ""),
            audience: String(req.body.idea?.audience ?? ""),
            problem: String(req.body.idea?.problem ?? ""),
            differentiation: String(req.body.idea?.differentiation ?? ""),
            evidence: req.body.idea?.evidence ?? [],
            score: Number(req.body.idea?.score ?? 0.5),
          },
          ...(req.body.styleGuidance === undefined
            ? {}
            : { styleGuidance: String(req.body.styleGuidance) }),
        },
        currentCorrelation(req),
      ),
    ),
  );

  router.post(
    "/drafts/lint",
    auth,
    wrap((req) =>
      deps.drafting.lintDraft(
        String(req.body.markdown ?? ""),
        req.body.options,
      ),
    ),
  );

  router.post(
    "/drafts",
    auth,
    wrap((req, res) =>
      deps.drafting.persistDraft({
        authorId: authorOf(res),
        title: String(req.body.title ?? ""),
        tags: req.body.tags ?? [],
        markdown: String(req.body.markdown ?? ""),
        ...(req.body.lintOptions === undefined
          ? {}
          : { lintOptions: req.body.lintOptions }),
      }),
    ),
  );

  router.put(
    "/drafts/:id",
    auth,
    wrap((req, res) =>
      deps.drafting.editDraft(authorOf(res), {
        draftId: String(req.params.id),
        markdown: String(req.body.markdown ?? ""),
        ...(req.body.title === undefined
          ? {}
          : { title: String(req.body.title) }),
      }),
    ),
  );

  router.post(
    "/drafts/:id/review",
    auth,
    wrap((req) =>
      deps.drafting.submitForReview(
        String(req.params.id),
        currentCorrelation(req),
      ),
    ),
  );

  // ── Approval and publishing ──────────────────────────────────────────
  router.post(
    "/drafts/:id/approve",
    auth,
    wrap((req, res) =>
      deps.articles.recordApproval(
        authorOf(res),
        {
          draftId: String(req.params.id),
          decision: req.body.decision === "REJECTED" ? "REJECTED" : "APPROVED",
          ttlSeconds: int(req.body.ttlSeconds, 1440),
          ...(req.body.feedback === undefined
            ? {}
            : { feedback: String(req.body.feedback) }),
        },
        currentCorrelation(req),
      ),
    ),
  );

  router.post(
    "/drafts/:id/publish",
    auth,
    wrap((req, res) =>
      deps.articles.publishArticle(
        authorOf(res),
        {
          draftId: String(req.params.id),
          idempotencyKey: String(req.body.idempotencyKey ?? ""),
        },
        currentCorrelation(req),
      ),
    ),
  );

  // ── Audit and workflow history ───────────────────────────────────────
  router.get(
    "/drafts/:id/audit",
    auth,
    wrap((req) => deps.workflows.auditHistory(String(req.params.id))),
  );

  router.get(
    "/drafts/:id/transitions",
    auth,
    wrap((req) => deps.workflows.transitionHistory(String(req.params.id))),
  );

  return router;
}

function currentCorrelation(req: Request): string {
  return normalizeCorrelationId(req.get("x-correlation-id"));
}

function normalizeForemState(
  value: unknown,
): "published" | "unpublished" | "all" {
  if (value === "published" || value === "unpublished") {
    return value;
  }
  return "all";
}
