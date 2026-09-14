import { describe, expect, it } from "vitest";
import {
  RetryExhaustedError,
  UpstreamHttpError,
  UpstreamPayloadError,
  UpstreamTimeoutError,
} from "../src/errors/api-errors.ts";
import { HttpClient } from "../src/lib/http-client.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import type { Clock } from "../src/core/policies/timeouts.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const clock: Clock = {
  now: () => 1_000,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

const context = { correlationId: "corr-http", endpoint: "articles" };

describe("HTTP retry and timeout policy", () => {
  it("retries a transient response and then succeeds", async () => {
    // Given
    let attempts = 0;
    const delays: number[] = [];
    const client = new HttpClient({
      fetch: async () => {
        attempts += 1;
        return attempts === 1
          ? new Response(null, { status: 503 })
          : Response.json({ ok: true });
      },
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      clock,
      logger,
    });

    // When
    const result = await client.getJson(
      new URL("https://dev.to/api/articles"),
      context,
    );

    // Then
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(delays).toEqual([100]);
  });

  it("stops after three transient failures", async () => {
    // Given
    let attempts = 0;
    const delays: number[] = [];
    const client = new HttpClient({
      fetch: async () => {
        attempts += 1;
        throw new TypeError("connection reset");
      },
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      clock,
      logger,
    });

    // When
    const request = client.getJson(
      new URL("https://dev.to/api/articles"),
      context,
    );

    // Then
    await expect(request).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(attempts).toBe(3);
    expect(delays).toEqual([100, 250]);
  });

  it("does not retry non-transient 4xx responses", async () => {
    // Given
    let attempts = 0;
    const client = new HttpClient({
      fetch: async () => {
        attempts += 1;
        return new Response(null, { status: 404 });
      },
      sleep: async () => undefined,
      clock,
      logger,
    });

    // When
    const request = client.getJson(
      new URL("https://dev.to/api/articles/404"),
      context,
    );

    // Then
    await expect(request).rejects.toBeInstanceOf(UpstreamHttpError);
    expect(attempts).toBe(1);
  });

  it("does not retry malformed JSON payloads", async () => {
    // Given
    let attempts = 0;
    const client = new HttpClient({
      fetch: async () => {
        attempts += 1;
        return new Response("not-json", { status: 200 });
      },
      sleep: async () => undefined,
      clock,
      logger,
    });

    // When
    const request = client.getJson(
      new URL("https://dev.to/api/articles"),
      context,
    );

    // Then
    await expect(request).rejects.toBeInstanceOf(UpstreamPayloadError);
    expect(attempts).toBe(1);
  });

  it("aborts timed-out attempts and reports exhaustion safely", async () => {
    // Given
    let attempts = 0;
    const immediateClock: Clock = {
      now: () => 1_000,
      setTimeout: (callback) => {
        const handle = setTimeout(() => undefined, 10_000);
        callback();
        return handle;
      },
      clearTimeout: (handle) => clearTimeout(handle),
    };
    const client = new HttpClient({
      fetch: async (_url, init) => {
        attempts += 1;
        if (init?.signal?.aborted) {
          throw new DOMException("timed out", "AbortError");
        }
        return Response.json({ unexpected: true });
      },
      sleep: async () => undefined,
      clock: immediateClock,
      logger,
    });

    // When
    const request = client.getJson(
      new URL("https://dev.to/api/articles"),
      context,
    );

    // Then
    const error = await request.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RetryExhaustedError);
    if (error instanceof RetryExhaustedError) {
      expect(error.lastError).toBeInstanceOf(UpstreamTimeoutError);
    }
    expect(attempts).toBe(3);
  });
});
