/** Cadence intervals, in milliseconds, for the supported schedule strings. */
export const CADENCE_MS: Readonly<Record<string, number>> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_CADENCE = "weekly";

export function cadenceMs(cadence: string): number {
  return CADENCE_MS[cadence.toLowerCase()] ?? CADENCE_MS[DEFAULT_CADENCE]!;
}

/**
 * True when enough time has elapsed since the last run for another run to be
 * due. A missing last-run timestamp means the author has never been scheduled,
 * so the run is due.
 */
export function isDue(
  lastRunAtMs: number | null,
  nowMs: number,
  cadence: string,
): boolean {
  if (lastRunAtMs === null) {
    return true;
  }
  return nowMs - lastRunAtMs >= cadenceMs(cadence);
}
