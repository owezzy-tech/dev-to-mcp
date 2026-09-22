import { hashContent } from "../../core/policies/content-hash.ts";
import { assertPublishAuthority } from "../../core/policies/lifecycle.ts";
import { buildArticleCases } from "../harness.ts";
import type { EvalCase, GradedCase } from "../types.ts";

const NOW = 1_800_000_000_000;

interface Outcome {
  readonly rejected: boolean;
  readonly message: string;
}

async function runScenario(setup: string): Promise<Outcome> {
  const authorId = "author-1";
  const { repository, useCases, publisher } = buildArticleCases();
  const markdown = "# Body\n";
  const { draft, version } = await repository.createDraftWithVersion({
    authorId,
    title: "Draft",
    tags: [],
    markdown,
    contentHash: hashContent(markdown),
    foremArticleId: 42,
  });

  switch (setup) {
    case "missing-capability":
      repository.capabilities = ["READ"];
      break;

    case "no-approval":
      await repository.setDraftState(draft.id, "APPROVED");
      break;

    case "rejected-approval":
      await repository.setDraftState(draft.id, "APPROVED");
      await repository.createApproval({
        authorId,
        draftVersionId: version.id,
        decision: "REJECTED",
        contentHash: version.contentHash,
        expiresAtMs: NOW + 60_000,
      });
      break;

    case "expired-approval":
      await repository.setDraftState(draft.id, "APPROVED");
      await repository.createApproval({
        authorId,
        draftVersionId: version.id,
        decision: "APPROVED",
        contentHash: version.contentHash,
        expiresAtMs: NOW - 1,
      });
      break;

    case "scheduler-actor":
      try {
        assertPublishAuthority("APPROVED", "PUBLISHING", "SCHEDULER");
        return {
          rejected: false,
          message: "scheduler reached a publishing transition",
        };
      } catch (error) {
        return {
          rejected: true,
          message: error instanceof Error ? error.name : "UnknownError",
        };
      }

    default:
      return { rejected: false, message: `unknown setup: ${setup}` };
  }

  try {
    await useCases.publishArticle(
      authorId,
      { draftId: draft.id, idempotencyKey: `eval-${draft.id}` },
      "eval-correlation",
    );
    return {
      rejected: false,
      message: `publish succeeded unexpectedly (${publisher.publishCalls.length} call(s))`,
    };
  } catch (error) {
    return {
      rejected: true,
      message: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

export async function gradePublishBypass(
  cases: readonly EvalCase[],
): Promise<readonly GradedCase[]> {
  return Promise.all(
    cases.map(async (c) => {
      const outcome = await runScenario(c.setup);
      return {
        id: c.id,
        label: c.label,
        passed: outcome.rejected,
        detail: outcome.message,
      };
    }),
  );
}
