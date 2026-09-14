import {
  UpstreamHttpError,
  UpstreamNetworkError,
  UpstreamTimeoutError,
} from "../../errors/api-errors.ts";
import type { ApiError } from "../../errors/api-errors.ts";

export const MAX_HTTP_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [100, 250] as const;

export function isRetryableError(error: ApiError): boolean {
  if (
    error instanceof UpstreamNetworkError ||
    error instanceof UpstreamTimeoutError
  ) {
    return true;
  }
  return (
    error instanceof UpstreamHttpError &&
    (error.statusCode === 408 ||
      error.statusCode === 429 ||
      error.statusCode >= 500)
  );
}
