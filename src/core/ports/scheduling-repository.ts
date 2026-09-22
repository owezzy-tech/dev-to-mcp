/** Durable scheduling state: topics, cadence, and last-run bookkeeping. */
export interface SchedulingRepository {
  getTopics(authorId: string): Promise<readonly string[]>;
  setTopics(authorId: string, topics: readonly string[]): Promise<void>;
  /** Cadence string, e.g. "weekly" (the default). */
  getCadence(authorId: string): Promise<string>;
  /** Epoch ms of the most recent scheduled run, or null when never run. */
  getLastRunAtMs(authorId: string): Promise<number | null>;
}
