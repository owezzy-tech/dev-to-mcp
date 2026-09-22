import type { Response } from "express";
import { ApiError, InternalError } from "../errors/api-errors.ts";
import { serializeApiError, toApiError } from "../errors/redaction.ts";

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  APPROVAL_INVALID: 409,
  DRAFT_QUALITY: 422,
  RETRY_EXHAUSTED: 503,
  UPSTREAM_HTTP_ERROR: 502,
  UPSTREAM_PAYLOAD_ERROR: 502,
  UPSTREAM_NETWORK_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

export function toHttpStatus(error: unknown): number {
  const apiError = toApiError(error);
  return STATUS_BY_CODE[apiError.code] ?? 500;
}

/** Send a normalized, safe error response without leaking internal detail. */
export function sendError(
  res: Response,
  error: unknown,
  correlationId: string,
): void {
  const status = toHttpStatus(error);
  res.status(status).json({
    error: serializeApiError(toApiError(error), correlationId),
  });
}

export { ApiError, InternalError };
