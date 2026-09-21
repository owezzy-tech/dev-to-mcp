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

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|bearer|private[-_]?key)/i;

const BEARER_VALUE_PATTERN = /(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;

export function redactSecrets(value: unknown): unknown {
  return redact(value, new WeakSet<object>());
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return value.replace(BEARER_VALUE_PATTERN, `$1${REDACTED}`);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : redact(entry, seen);
  }
  return output;
}
