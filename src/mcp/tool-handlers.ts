import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AppLogger } from "../core/ports/logger.ts";
import type { DiscoveryUseCases } from "../core/use-cases/discovery.ts";
import { InvalidInputError } from "../errors/api-errors.ts";
import { serializeApiError, toApiError } from "../errors/redaction.ts";
import { createTextResult } from "../lib/utils.ts";
import type {
  GetArticleInput,
  GetArticlesInput,
  GetCommentsInput,
  GetTagsInput,
  GetUserInput,
  SearchArticlesInput,
} from "./tool-schemas.ts";

type ToolHandlerDependencies = {
  readonly useCases: DiscoveryUseCases;
  readonly logger: AppLogger;
  readonly getCorrelationId: () => string;
};

export type ToolHandlers = {
  readonly getArticles: (input: GetArticlesInput) => Promise<CallToolResult>;
  readonly getArticle: (input: GetArticleInput) => Promise<CallToolResult>;
  readonly getUser: (input: GetUserInput) => Promise<CallToolResult>;
  readonly getTags: (input: GetTagsInput) => Promise<CallToolResult>;
  readonly getComments: (input: GetCommentsInput) => Promise<CallToolResult>;
  readonly searchArticles: (
    input: SearchArticlesInput,
  ) => Promise<CallToolResult>;
};

export function createToolHandlers(
  dependencies: ToolHandlerDependencies,
): ToolHandlers {
  const execute = async (
    operation: (correlationId: string) => Promise<unknown>,
  ): Promise<CallToolResult> => {
    const correlationId = dependencies.getCorrelationId();
    try {
      return createTextResult(await operation(correlationId));
    } catch (error) {
      const apiError = toApiError(error);
      if (!(apiError instanceof InvalidInputError)) {
        dependencies.logger.error(
          { correlationId, errorCode: apiError.code },
          "tool.call.failed",
        );
      }
      return {
        ...createTextResult(serializeApiError(apiError, correlationId)),
        isError: true,
      };
    }
  };

  return {
    getArticles: (input) =>
      execute((correlationId) =>
        dependencies.useCases.listArticles(input, correlationId),
      ),
    getArticle: (input) =>
      execute((correlationId) =>
        dependencies.useCases.getArticle(input, correlationId),
      ),
    getUser: (input) =>
      execute((correlationId) =>
        dependencies.useCases.getUser(input, correlationId),
      ),
    getTags: (input) =>
      execute((correlationId) =>
        dependencies.useCases.listTags(
          input.page,
          input.per_page,
          correlationId,
        ),
      ),
    getComments: (input) =>
      execute((correlationId) =>
        dependencies.useCases.listComments(input.article_id, correlationId),
      ),
    searchArticles: (input) =>
      execute((correlationId) =>
        dependencies.useCases.searchArticles(input, correlationId),
      ),
  };
}
