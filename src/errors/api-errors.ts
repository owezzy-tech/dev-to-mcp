export const API_ERROR_CODES = {
  invalidInput: "INVALID_INPUT",
  upstreamHttp: "UPSTREAM_HTTP_ERROR",
  upstreamTimeout: "UPSTREAM_TIMEOUT",
  upstreamNetwork: "UPSTREAM_NETWORK_ERROR",
  upstreamPayload: "UPSTREAM_PAYLOAD_ERROR",
  retryExhausted: "RETRY_EXHAUSTED",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  internal: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

type ApiErrorOptions = {
  readonly cause?: unknown;
};

/**
 * Base class for the safe, transport-independent error taxonomy.
 *
 * `publicMessage` is the only text that may cross a public boundary: it is
 * written to be safe by construction (no urls, tokens, stack traces, or raw
 * upstream bodies). Diagnostic detail stays on `cause`.
 *
 * Note: fields are assigned in the constructor body rather than declared as
 * parameter properties, because the server runs under Node's strip-only
 * TypeScript mode which rejects non-erasable syntax.
 */
export class ApiError extends Error {
  override readonly name: string = "ApiError";

  readonly code: ApiErrorCode;

  readonly publicMessage: string;

  constructor(
    code: ApiErrorCode,
    publicMessage: string,
    options: ApiErrorOptions = {},
  ) {
    super(publicMessage, options);
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export class InvalidInputError extends ApiError {
  override readonly name = "InvalidInputError";

  constructor(
    publicMessage = "The provided input is invalid.",
    options: ApiErrorOptions = {},
  ) {
    super(API_ERROR_CODES.invalidInput, publicMessage, options);
  }
}

export class UpstreamHttpError extends ApiError {
  override readonly name = "UpstreamHttpError";

  readonly statusCode: number;

  readonly retryAfterMs: number | null;

  readonly attempt: number;

  constructor(
    statusCode: number,
    retryAfterMs: number | null,
    attempt: number,
    options: ApiErrorOptions = {},
  ) {
    super(
      API_ERROR_CODES.upstreamHttp,
      "The upstream service returned an error.",
      options,
    );
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
    this.attempt = attempt;
  }
}

export class UpstreamTimeoutError extends ApiError {
  override readonly name = "UpstreamTimeoutError";

  constructor(options: ApiErrorOptions = {}) {
    super(
      API_ERROR_CODES.upstreamTimeout,
      "The upstream service timed out.",
      options,
    );
  }
}

export class UpstreamNetworkError extends ApiError {
  override readonly name = "UpstreamNetworkError";

  constructor(options: ApiErrorOptions = {}) {
    super(
      API_ERROR_CODES.upstreamNetwork,
      "The upstream service could not be reached.",
      options,
    );
  }
}

export class UpstreamPayloadError extends ApiError {
  override readonly name = "UpstreamPayloadError";

  constructor(options: ApiErrorOptions = {}) {
    super(
      API_ERROR_CODES.upstreamPayload,
      "The upstream service returned an invalid payload.",
      options,
    );
  }
}

export class RetryExhaustedError extends ApiError {
  override readonly name = "RetryExhaustedError";

  readonly lastError: ApiError;

  constructor(lastError: ApiError) {
    super(
      API_ERROR_CODES.retryExhausted,
      "The upstream service is temporarily unavailable.",
      { cause: lastError },
    );
    this.lastError = lastError;
  }
}

export class UnauthorizedError extends ApiError {
  override readonly name = "UnauthorizedError";

  constructor(
    publicMessage = "Authentication is required.",
    options: ApiErrorOptions = {},
  ) {
    super(API_ERROR_CODES.unauthorized, publicMessage, options);
  }
}

export class ForbiddenError extends ApiError {
  override readonly name = "ForbiddenError";

  constructor(
    publicMessage = "The requested capability is not granted.",
    options: ApiErrorOptions = {},
  ) {
    super(API_ERROR_CODES.forbidden, publicMessage, options);
  }
}

export class InternalError extends ApiError {
  override readonly name = "InternalError";

  constructor(options: ApiErrorOptions = {}) {
    super(API_ERROR_CODES.internal, "An internal error occurred.", options);
  }
}
