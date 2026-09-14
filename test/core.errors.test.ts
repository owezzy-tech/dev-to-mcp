import { describe, expect, it } from "vitest";
import {
  InternalError,
  RetryExhaustedError,
  UpstreamHttpError,
  UpstreamNetworkError,
  UpstreamPayloadError,
  UpstreamTimeoutError,
} from "../src/errors/api-errors.ts";
import { serializeApiError } from "../src/errors/redaction.ts";
import {
  mapHttpError,
  mapPayloadError,
  mapRequestError,
} from "../src/adapters/forem/forem-errors.ts";

describe("safe API error taxonomy", () => {
  it("maps HTTP, timeout, network, and payload failures", () => {
    // Given
    const abort = new DOMException("aborted", "AbortError");

    // When
    const http = mapHttpError(503, null, 0);
    const timeout = mapRequestError(abort, true);
    const network = mapRequestError(new TypeError("socket details"), false);
    const payload = mapPayloadError(new SyntaxError("raw body details"));

    // Then
    expect(http).toBeInstanceOf(UpstreamHttpError);
    expect(timeout).toBeInstanceOf(UpstreamTimeoutError);
    expect(network).toBeInstanceOf(UpstreamNetworkError);
    expect(payload).toBeInstanceOf(UpstreamPayloadError);
  });

  it("represents exhausted retries without exposing the last failure", () => {
    // Given
    const lastError = new UpstreamNetworkError({
      cause: new Error("network-secret"),
    });

    // When
    const error = new RetryExhaustedError(lastError);
    const serialized = serializeApiError(error, "corr-123");

    // Then
    expect(serialized).toEqual({
      message: "The upstream service is temporarily unavailable.",
      code: "RETRY_EXHAUSTED",
      correlationId: "corr-123",
    });
  });

  it("redacts stacks, secrets, raw bodies, and query values", () => {
    // Given
    const secret = "SENTINEL_TOKEN_123";
    const unsafeCause = new Error(
      `https://dev.to/api/users/by_username?url=${secret} raw=${secret}`,
    );
    const error = new InternalError({ cause: unsafeCause });

    // When
    const serialized = serializeApiError(error, "corr-safe");
    const output = JSON.stringify(serialized);

    // Then
    expect(serialized).toEqual({
      message: "An internal error occurred.",
      code: "INTERNAL_ERROR",
      correlationId: "corr-safe",
    });
    expect(output).not.toContain(secret);
    expect(output).not.toContain("stack");
    expect(output).not.toContain("by_username?");
  });
});
