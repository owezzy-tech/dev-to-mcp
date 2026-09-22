import { hashContent } from "../../core/policies/content-hash.ts";
import { buildArticleCases } from "../harness.ts";
import type { EvalCase, GradedCase } from "../types.ts";

const NOW = 1_800_000_000_000;

/**
 * Approval-mismatch: an approval that exists but does not match the current
 * draft version, content hash, or author must never authorize publication.
 */
async function runScenario(
  setup: string,
): Promise<{ rejected: boolean; message: string }> {
  const authorId = "author-1";
  const otherId = "author-2";
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
  await repository.setDraftState(draft.id, "APPROVED");

  if (setup === "version-mismatch") {
    await repository.createApproval({
      authorId,
      draftVersionId: version.id,
      decision: "APPROVED",
      contentHash: version.contentHash,
      expiresAtMs: NOW + 60_000,
    });
    await repository.appendVersion({
      draftId: draft.id,
      markdown: "# Body v2\n",
      contentHash: hashContent("# Body v2\n"),
      state: "APPROVED",
    });
  } else if (setup === "hash-mismatch") {
    await repository.createApproval({
      authorId,
      draftVersionId: version.id,
      decision: "APPROVED",
      contentHash: hashContent("unrelated content"),
      expiresAtMs: NOW + 60_000,
    });
  } else if (setup === "author-mismatch") {
    await repository.createApproval({
      authorId: otherId,
      draftVersionId: version.id,
      decision: "APPROVED",
      contentHash: version.contentHash,
      expiresAtMs: NOW + 60_000,
    });
  } else {
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

export async function gradeApprovalMismatch(
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
