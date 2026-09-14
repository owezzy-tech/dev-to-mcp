import {
  UpstreamHttpError,
  UpstreamNetworkError,
  UpstreamPayloadError,
  UpstreamTimeoutError,
} from "../../errors/api-errors.ts";

export function mapHttpError(
  statusCode: number,
  retryAfterMs: number | null,
  attempt: number,
): UpstreamHttpError {
  return new UpstreamHttpError(statusCode, retryAfterMs, attempt);
}

export function mapRequestError(
  error: unknown,
  timedOut: boolean,
): UpstreamTimeoutError | UpstreamNetworkError {
  if (timedOut) {
    return new UpstreamTimeoutError({ cause: error });
  }
  return new UpstreamNetworkError({ cause: error });
}

export function mapPayloadError(error: unknown): UpstreamPayloadError {
  return new UpstreamPayloadError({ cause: error });
}
