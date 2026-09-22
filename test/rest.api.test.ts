import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestDeps, type TestDeps } from "./helpers/rest-app.ts";

let ctx: TestDeps;
let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  ctx = buildTestDeps();
  const server = await ctx.start();
  baseUrl = server.baseUrl;
  close = server.close;
});

afterAll(async () => {
  await close();
});

async function get(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

async function post(
  path: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

const CLEAN_DRAFT = [
  "# Angular signals",
  "Angular signals are a reactive primitive. See the [docs](https://angular.dev/guide/signals).",
  "```ts",
  "const count = signal(0);",
  "```",
].join("\n");

describe("versioned REST API", () => {
  it("serves public discovery without auth", async () => {
    const res = await get("/articles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns 401 for an authenticated route without a session", async () => {
    const res = await get("/me/capabilities");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid session token", async () => {
    const res = await get("/me/capabilities", "bad-token");
    expect(res.status).toBe(401);
  });

  it("returns capabilities for a valid session", async () => {
    const res = await get("/me/capabilities", "valid-token");
    expect(res.status).toBe(200);
    const body = (await res.json()) as string[];
    expect(body).toContain("PUBLISH");
  });

  it("persists a draft through the drafting flow", async () => {
    const res = await post(
      "/drafts",
      { title: "Signals", tags: ["angular"], markdown: CLEAN_DRAFT },
      "valid-token",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: { id: string; state: string } };
    expect(body.draft.state).toBe("DRAFTING");

    const review = await post(
      `/drafts/${body.draft.id}/review`,
      {},
      "valid-token",
    );
    expect(review.status).toBe(200);
    const reviewed = (await review.json()) as { state: string };
    expect(reviewed.state).toBe("AWAITING_APPROVAL");
  });

  it("blocks a draft that fails quality checks", async () => {
    const res = await post(
      "/drafts",
      {
        title: "Bad",
        tags: [],
        markdown: "Signals are the fastest way to manage state.",
      },
      "valid-token",
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DRAFT_QUALITY");
  });

  it("maps invalid input to 400", async () => {
    const res = await post("/ideas", { topic: "", count: 0 }, "valid-token");
    expect(res.status).toBe(400);
  });

  it("propagates the correlation id header", async () => {
    const res = await fetch(`${baseUrl}/articles`, {
      headers: { "x-correlation-id": "corr-123" },
    });
    expect(res.headers.get("x-correlation-id")).toBe("corr-123");
  });

  it("records an approval decision for a reviewed draft", async () => {
    const created = await post(
      "/drafts",
      { title: "Approval", tags: ["angular"], markdown: CLEAN_DRAFT },
      "valid-token",
    );
    const draft = (await created.json()) as { draft: { id: string } };
    await post(`/drafts/${draft.draft.id}/review`, {}, "valid-token");

    const approve = await post(
      `/drafts/${draft.draft.id}/approve`,
      { decision: "APPROVED", ttlSeconds: 600 },
      "valid-token",
    );
    expect(approve.status).toBe(200);
    const approval = (await approve.json()) as { decision: string };
    expect(approval.decision).toBe("APPROVED");
  });

  it("triggers a scheduled run and reports its status", async () => {
    const trigger = await post(
      "/scheduling/trigger",
      { idempotencyKey: "sched-key-1" },
      "valid-token",
    );
    expect(trigger.status).toBe(200);
    const run = (await trigger.json()) as { id: string; state: string };
    expect(run.state).toBe("RESEARCHING");

    const status = await get("/scheduling/status", "valid-token");
    expect(status.status).toBe(200);
    const body = (await status.json()) as { due: boolean; topics: string[] };
    expect(body.due).toBe(true);
  });

  it("configures scheduling topics", async () => {
    const put = await fetch(`${baseUrl}/scheduling/topics`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ topics: ["angular", "aws"] }),
    });
    expect(put.status).toBe(204);

    const topics = await get("/scheduling/topics", "valid-token");
    expect(await topics.json()).toEqual(["angular", "aws"]);
  });
});
