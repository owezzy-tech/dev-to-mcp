/**
 * Bounded retry and lease policy for durable workflow runs.
 *
 * Values are intentionally small and deterministic so restart/recovery tests
 * can assert exact behavior without sleeping on wall-clock backoff.
 */

/** Maximum number of attempts a workflow run may make before it stays FAILED. */
export const MAX_WORKFLOW_ATTEMPTS = 5;

/** How long a worker may hold a lease before another worker may reclaim it. */
export const LEASE_DURATION_MS = 30_000;

/** Base for exponential backoff, in milliseconds. */
export const BACKOFF_BASE_MS = 1_000;

/** Upper bound for any single backoff delay, in milliseconds. */
export const BACKOFF_MAX_MS = 60_000;

/**
 * Exponential backoff with a hard ceiling. `attempt` is 1-based: the first
 * failure (attempt 1) waits `BACKOFF_BASE_MS`.
 */
export function backoffMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 1) {
    return BACKOFF_BASE_MS;
  }
  const exponential = BACKOFF_BASE_MS * 2 ** (attempt - 1);
  return Math.min(exponential, BACKOFF_MAX_MS);
}

export function hasAttemptsRemaining(attempt: number): boolean {
  return attempt < MAX_WORKFLOW_ATTEMPTS;
}
