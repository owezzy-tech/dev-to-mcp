import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const VALID_CORRELATION_ID = /^[A-Za-z0-9._-]{1,64}$/;
const correlationStorage = new AsyncLocalStorage<string>();

export function normalizeCorrelationId(value: unknown): string {
  if (typeof value === "string" && VALID_CORRELATION_ID.test(value)) {
    return value;
  }
  return randomUUID();
}

export function currentCorrelationId(): string {
  return correlationStorage.getStore() ?? randomUUID();
}

export function withCorrelationId<T>(
  correlationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return correlationStorage.run(correlationId, operation);
}
