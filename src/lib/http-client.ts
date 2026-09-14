import type { AppLogger } from "../core/ports/logger.ts";
import {
  MAX_HTTP_ATTEMPTS,
  RETRY_BACKOFF_MS,
  isRetryableError,
} from "../core/policies/retry.ts";
import {
  HTTP_TIMEOUT_MS,
  systemClock,
  type Clock,
} from "../core/policies/timeouts.ts";
import { ApiError, RetryExhaustedError } from "../errors/api-errors.ts";
import {
  mapHttpError,
  mapPayloadError,
  mapRequestError,
} from "../adapters/forem/forem-errors.ts";

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type Sleep = (delayMs: number) => Promise<void>;

type HttpClientDependencies = {
  readonly fetch: Fetch;
  readonly sleep: Sleep;
  readonly clock: Clock;
  readonly logger: AppLogger;
};

export type HttpRequestContext = {
  readonly correlationId: string;
  readonly endpoint: string;
};

const defaultSleep: Sleep = async (delayMs) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

export class HttpClient {
  private readonly dependencies: HttpClientDependencies;

  constructor(
    dependencies: Partial<HttpClientDependencies> &
      Pick<HttpClientDependencies, "logger">,
  ) {
    this.dependencies = {
      fetch: dependencies.fetch ?? globalThis.fetch,
      sleep: dependencies.sleep ?? defaultSleep,
      clock: dependencies.clock ?? systemClock,
      logger: dependencies.logger,
    };
  }

  async getJson(url: URL, context: HttpRequestContext): Promise<unknown> {
    let lastError: ApiError | undefined;
    for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt += 1) {
      try {
        return await this.executeAttempt(url, context, attempt);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          throw error;
        }
        if (!isRetryableError(error)) {
          throw error;
        }
        lastError = error;
        if (attempt === MAX_HTTP_ATTEMPTS - 1) {
          break;
        }
        const delayMs = RETRY_BACKOFF_MS[attempt];
        if (delayMs === undefined) {
          break;
        }
        this.dependencies.logger.warn(
          {
            correlationId: context.correlationId,
            endpoint: context.endpoint,
            attempt: attempt + 1,
            delayMs,
            errorCode: error.code,
          },
          "forem.request.retry",
        );
        await this.dependencies.sleep(delayMs);
      }
    }
    if (lastError === undefined) {
      throw new UpstreamStateError();
    }
    throw new RetryExhaustedError(lastError);
  }

  private async executeAttempt(
    url: URL,
    context: HttpRequestContext,
    attempt: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = this.dependencies.clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, HTTP_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.dependencies.fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      throw mapRequestError(error, timedOut);
    } finally {
      this.dependencies.clock.clearTimeout(timeout);
    }

    if (!response.ok) {
      throw mapHttpError(
        response.status,
        parseRetryAfter(
          response.headers.get("retry-after"),
          this.dependencies.clock.now(),
        ),
        attempt,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw mapPayloadError(error);
    }
  }
}

class UpstreamStateError extends ApiError {
  readonly name = "UpstreamStateError";

  constructor() {
    super("INTERNAL_ERROR", "An internal error occurred.");
  }
}

function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return null;
  }
  return Math.max(0, dateMs - nowMs);
}
