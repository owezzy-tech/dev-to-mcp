import { describe, expect, it } from "vitest";
import {
  SessionRegistry,
  type SessionRegistryClock,
  type SessionTransport,
} from "../src/mcp/session-registry.ts";

class FakeTransport implements SessionTransport {
  onclose: (() => void) | undefined;
  closeCount = 0;

  async close(): Promise<void> {
    this.closeCount += 1;
    this.onclose?.();
  }

  simulateRemoteClose(): void {
    this.onclose?.();
  }
}

class FakeClock implements SessionRegistryClock {
  nowMs = 0;
  intervalCallback: (() => void) | undefined;
  unrefCount = 0;
  clearCount = 0;

  now(): number {
    return this.nowMs;
  }

  setInterval(callback: () => void, _intervalMs: number): NodeJS.Timeout {
    this.intervalCallback = callback;
    const handle = setInterval(() => undefined, 60_000);
    const originalUnref = handle.unref.bind(handle);
    handle.unref = () => {
      this.unrefCount += 1;
      return originalUnref();
    };
    return handle;
  }

  clearInterval(handle: NodeJS.Timeout): void {
    this.clearCount += 1;
    clearInterval(handle);
  }
}

describe("MCP session registry", () => {
  it("refreshes activity and only expires idle sessions", async () => {
    // Given
    const clock = new FakeClock();
    const registry = new SessionRegistry({
      clock,
      ttlMs: 1_000,
      cleanupIntervalMs: 60_000,
    });
    const active = new FakeTransport();
    const idle = new FakeTransport();
    registry.register("active", active);
    registry.register("idle", idle);
    clock.nowMs = 900;
    registry.getAndTouch("active");

    // When
    clock.nowMs = 1_500;
    await registry.cleanupExpired();

    // Then
    expect(registry.has("active")).toBe(true);
    expect(registry.has("idle")).toBe(false);
    expect(active.closeCount).toBe(0);
    expect(idle.closeCount).toBe(1);
    await registry.dispose();
  });

  it("removes a session when its transport closes", async () => {
    // Given
    const clock = new FakeClock();
    const registry = new SessionRegistry({ clock });
    const transport = new FakeTransport();
    let cleanupCount = 0;
    registry.register("session", transport, async () => {
      cleanupCount += 1;
    });

    // When
    transport.simulateRemoteClose();
    await Promise.resolve();

    // Then
    expect(registry.has("session")).toBe(false);
    expect(cleanupCount).toBe(1);
    await registry.dispose();
  });

  it("unrefs the cleanup timer", async () => {
    // Given
    const clock = new FakeClock();

    // When
    const registry = new SessionRegistry({ clock });

    // Then
    expect(clock.unrefCount).toBe(1);
    await registry.dispose();
    expect(clock.clearCount).toBe(1);
  });
});
