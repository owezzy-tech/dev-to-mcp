export const HTTP_TIMEOUT_MS = 5_000;

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): NodeJS.Timeout;
  clearTimeout(handle: NodeJS.Timeout): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};
