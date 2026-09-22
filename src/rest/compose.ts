import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  createAuditLogger,
  type AuditLogger,
} from "../adapters/audit/audit-log.ts";
import { createDashboardSessionStore } from "../adapters/auth/session-store.ts";
import { createRedisClient } from "../adapters/cache/redis-client.ts";
import { OpenAICompatibleEmbeddingProvider } from "../adapters/embeddings/openai-compatible.ts";
import { ForemApiClient } from "../adapters/forem/forem-api-client.ts";
import { createForemPublisherClient } from "../adapters/forem/forem-publisher-client.ts";
import { OpenAICompatibleGenerationProvider } from "../adapters/generation/openai-compatible.ts";
import {
  TypeSafeJudgmentProvider,
  NullJudgmentProvider,
} from "../adapters/judgment/typesafe.ts";
import { PrismaArticleRepository } from "../adapters/persistence/prisma-article-repository.ts";
import { createPrismaClient } from "../adapters/persistence/prisma-client.ts";
import { PrismaRetrievalRepository } from "../adapters/persistence/prisma-retrieval-repository.ts";
import { PrismaWorkflowRepository } from "../adapters/persistence/prisma-workflow-repository.ts";
import type { Config } from "../config.ts";
import type { ArticleRepository } from "../core/ports/article-repository.ts";
import {
  NULL_EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from "../core/ports/embedding-provider.ts";
import type { ForemPublisher } from "../core/ports/forem-publisher.ts";
import {
  NULL_GENERATION_PROVIDER,
  type GenerationProvider,
} from "../core/ports/generation-provider.ts";
import type { JudgmentProvider } from "../core/ports/judgment-provider.ts";
import type { AppLogger } from "../core/ports/logger.ts";
import type { RetrievalRepository } from "../core/ports/retrieval-repository.ts";
import type { WorkflowRepository } from "../core/ports/workflow-repository.ts";
import { ArticleManagementUseCases } from "../core/use-cases/article-management.ts";
import { DiscoveryUseCases } from "../core/use-cases/discovery.ts";
import { DraftingUseCases } from "../core/use-cases/drafting.ts";
import { RetrievalUseCases } from "../core/use-cases/retrieval.ts";
import { WorkflowEngine } from "../core/use-cases/workflow-engine.ts";
import { HttpClient } from "../lib/http-client.ts";
import type { AuthorResolver } from "./auth.ts";
import { InternalError } from "../errors/api-errors.ts";
import { ConsoleNotificationProvider } from "../adapters/notifications/console.ts";
import { PrismaSchedulingRepository } from "../adapters/persistence/prisma-scheduling-repository.ts";
import type { NotificationProvider } from "../core/ports/notification-provider.ts";
import { SchedulingUseCases } from "../core/use-cases/scheduling.ts";

/** Everything the REST (and MCP) adapters need to serve shared handlers. */
export interface AppDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis | undefined;
  readonly discovery: DiscoveryUseCases;
  readonly articles: ArticleManagementUseCases;
  readonly retrieval: RetrievalUseCases;
  readonly drafting: DraftingUseCases;
  readonly workflows: WorkflowEngine;
  readonly scheduling: SchedulingUseCases;
  readonly repository: ArticleRepository;
  readonly retrievalRepository: RetrievalRepository;
  readonly workflowRepository: WorkflowRepository;
  readonly audit: AuditLogger;
  readonly authorResolver: AuthorResolver;
  readonly logger: AppLogger;
}

const OPENAI_BASE_URL = "https://api.openai.com";
const TYPESAFE_BASE_URL = "https://api.typesafe.ai";

/**
 * Composition root: wires config + adapters + providers + repositories into the
 * shared use cases. Providers degrade to null implementations when their
 * credentials are absent, so the system runs with any subset configured.
 */
export function composeApp(config: Config, logger: AppLogger): AppDependencies {
  const httpClient = new HttpClient({ logger });

  const prisma =
    config.DATABASE_URL === undefined
      ? (undefined as unknown as PrismaClient)
      : createPrismaClient({ connectionString: config.DATABASE_URL });

  const redis =
    config.REDIS_URL === undefined
      ? undefined
      : createRedisClient({ url: config.REDIS_URL });

  const foremClient = new ForemApiClient(httpClient);
  const discovery = new DiscoveryUseCases(foremClient, logger);

  const repository = new PrismaArticleRepository(prisma);
  const retrievalRepository = new PrismaRetrievalRepository(prisma);
  const workflowRepository = new PrismaWorkflowRepository(prisma);
  const audit = createAuditLogger(prisma);

  const foremPublisher: ForemPublisher =
    config.FOREM_API_KEY === undefined
      ? nullPublisher()
      : createForemPublisherClient({
          httpClient,
          apiKey: config.FOREM_API_KEY,
          apiVersion: config.FOREM_API_VERSION,
        });

  const embeddingProvider: EmbeddingProvider =
    config.EMBEDDING_API_KEY === undefined
      ? NULL_EMBEDDING_PROVIDER
      : new OpenAICompatibleEmbeddingProvider({
          baseUrl: config.EMBEDDING_BASE_URL ?? OPENAI_BASE_URL,
          apiKey: config.EMBEDDING_API_KEY,
          model: config.EMBEDDING_MODEL,
          dimensions: config.EMBEDDING_DIMENSIONS,
          httpClient,
        });

  const generationProvider: GenerationProvider =
    config.GENERATION_API_KEY === undefined
      ? NULL_GENERATION_PROVIDER
      : new OpenAICompatibleGenerationProvider({
          baseUrl: config.GENERATION_BASE_URL ?? OPENAI_BASE_URL,
          apiKey: config.GENERATION_API_KEY,
          model: config.GENERATION_MODEL,
          httpClient,
        });

  const judgmentProvider: JudgmentProvider =
    config.TYPESAFE_API_KEY === undefined
      ? new NullJudgmentProvider()
      : new TypeSafeJudgmentProvider({
          baseUrl: config.TYPESAFE_BASE_URL ?? TYPESAFE_BASE_URL,
          apiKey: config.TYPESAFE_API_KEY,
          model: config.TYPESAFE_MODEL,
          httpClient,
        });

  const articles = new ArticleManagementUseCases(
    repository,
    foremPublisher,
    logger,
  );
  const retrieval = new RetrievalUseCases(
    retrievalRepository,
    embeddingProvider,
    judgmentProvider,
    logger,
  );
  const drafting = new DraftingUseCases(generationProvider, repository, logger);
  const workflows = new WorkflowEngine({
    workflows: workflowRepository,
    articles: repository,
    audit,
    auditQuery: workflowRepository,
    logger,
    workerId: `rest-${randomUUID()}`,
  });

  const schedulingRepository = new PrismaSchedulingRepository(prisma);
  const notifications: NotificationProvider = new ConsoleNotificationProvider(
    logger,
  );
  const scheduling = new SchedulingUseCases(
    workflows,
    schedulingRepository,
    notifications,
    logger,
  );

  const authorResolver: AuthorResolver = buildAuthorResolver(prisma, redis);

  return {
    prisma,
    redis,
    discovery,
    articles,
    retrieval,
    drafting,
    workflows,
    scheduling,
    repository,
    retrievalRepository,
    workflowRepository,
    audit,
    authorResolver,
    logger,
  };
}

function buildAuthorResolver(
  prisma: PrismaClient,
  redis: Redis | undefined,
): AuthorResolver {
  if (redis === undefined) {
    return async () => undefined;
  }
  const store = createDashboardSessionStore({ prisma, redis });
  return async (token) => (await store.validate(token))?.authorId;
}

function nullPublisher(): ForemPublisher {
  return {
    async listMyArticles() {
      return [];
    },
    async createArticleDraft() {
      throw new InternalError();
    },
    async updateArticleDraft() {
      throw new InternalError();
    },
    async publishArticle() {
      throw new InternalError();
    },
  };
}
