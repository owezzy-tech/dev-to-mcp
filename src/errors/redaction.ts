import { ApiError, InternalError } from "./api-errors.ts";

export type SafeApiError = {
  readonly message: string;
  readonly code: string;
  readonly correlationId: string;
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new InternalError({ cause: error });
}

export function serializeApiError(
  error: unknown,
  correlationId: string,
): SafeApiError {
  const apiError = toApiError(error);
  return {
    message: apiError.publicMessage,
    code: apiError.code,
    correlationId,
  };
}
