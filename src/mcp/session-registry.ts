export const SESSION_TTL_MS = 30 * 60 * 1000;
export const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;

export interface SessionTransport {
  onclose: (() => void) | undefined;
  close(): Promise<void>;
}

export interface SessionRegistryClock {
  now(): number;
  setInterval(callback: () => void, intervalMs: number): NodeJS.Timeout;
  clearInterval(handle: NodeJS.Timeout): void;
}

type SessionEntry = {
  readonly transport: SessionTransport;
  readonly closeResource?: () => Promise<void>;
  lastActivityMs: number;
};

type SessionRegistryOptions = {
  readonly clock?: SessionRegistryClock;
  readonly ttlMs?: number;
  readonly cleanupIntervalMs?: number;
};

const systemClock: SessionRegistryClock = {
  now: () => Date.now(),
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle),
};

/**
 * Owns MCP session transports with an idle TTL and a self-cleaning timer.
 *
 * A session is evicted from the active map synchronously as soon as it closes,
 * so `has()` never reports a session that is mid-teardown; the underlying
 * transport is closed (and the optional server resource released) afterwards.
 */
export class SessionRegistry {
  private readonly entries = new Map<string, SessionEntry>();
  private readonly closing = new Map<string, Promise<void>>();
  private readonly clock: SessionRegistryClock;
  private readonly ttlMs: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(options: SessionRegistryOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;
    this.cleanupTimer = this.clock.setInterval(() => {
      void this.cleanupExpired();
    }, options.cleanupIntervalMs ?? SESSION_CLEANUP_INTERVAL_MS);
    // Never keep the process alive solely for session cleanup.
    this.cleanupTimer.unref();
  }

  register(
    sessionId: string,
    transport: SessionTransport,
    closeResource?: () => Promise<void>,
  ): void {
    const priorOnClose = transport.onclose;
    const entry: SessionEntry = {
      transport,
      lastActivityMs: this.clock.now(),
      ...(closeResource === undefined ? {} : { closeResource }),
    };
    this.entries.set(sessionId, entry);
    transport.onclose = () => {
      priorOnClose?.();
      void this.closeSession(sessionId, false);
    };
  }

  getAndTouch(sessionId: string): SessionTransport | undefined {
    const entry = this.entries.get(sessionId);
    if (entry === undefined) {
      return undefined;
    }
    entry.lastActivityMs = this.clock.now();
    return entry.transport;
  }

  has(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  close(sessionId: string): Promise<void> {
    return this.closeSession(sessionId, true);
  }

  async cleanupExpired(): Promise<void> {
    const now = this.clock.now();
    const expiredIds = [...this.entries.entries()]
      .filter(([, entry]) => now - entry.lastActivityMs >= this.ttlMs)
      .map(([sessionId]) => sessionId);
    await Promise.all(expiredIds.map((sessionId) => this.close(sessionId)));
  }

  async dispose(): Promise<void> {
    this.clock.clearInterval(this.cleanupTimer);
    await Promise.all(
      [...this.entries.keys()].map((sessionId) => this.close(sessionId)),
    );
  }

  private closeSession(
    sessionId: string,
    closeTransport: boolean,
  ): Promise<void> {
    const existing = this.closing.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    const entry = this.entries.get(sessionId);
    if (entry === undefined) {
      return Promise.resolve();
    }

    // Evict eagerly so the session is no longer routable during teardown.
    this.entries.delete(sessionId);

    const closing = (async () => {
      try {
        if (closeTransport) {
          await entry.transport.close();
        }
        await entry.closeResource?.();
      } finally {
        this.closing.delete(sessionId);
      }
    })();

    this.closing.set(sessionId, closing);
    return closing;
  }
}
