import { Injectable, signal } from '@angular/core';

/**
 * WebMCP is an evolving browser standard. This module feature-detects the
 * browser API, degrades gracefully when it is absent (FR-064), and keeps the
 * structured result returned to an agent in sync with visible UI state
 * (FR-063).
 */

export interface WebMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: unknown;
}

export interface WebMcpApi {
  registerTool(tool: WebMcpTool): Promise<void>;
  listTools(): Promise<readonly string[]>;
}

/** The subset of the global object that may expose WebMCP. */
export interface WebMcpGlobal {
  readonly webmcp?: WebMcpApi;
}

export type WebMcpStatus =
  | { readonly supported: true; readonly api: WebMcpApi }
  | { readonly supported: false; readonly reason: string };

export interface ActionRecord {
  readonly tool: string;
  readonly result: unknown;
  readonly at: string;
}

export function detectWebMcp(global: WebMcpGlobal): WebMcpStatus {
  if (global.webmcp === undefined) {
    return {
      supported: false,
      reason: 'WebMCP is not supported in this browser.',
    };
  }
  return { supported: true, api: global.webmcp };
}

type Invoke = (args: unknown) => Promise<unknown>;

@Injectable({ providedIn: 'root' })
export class WebMcpService {
  readonly status = signal<WebMcpStatus>({
    supported: false,
    reason: 'Detecting WebMCP support…',
  });

  /** Tools registered with the browser, in registration order. */
  readonly registered = signal<readonly string[]>([]);

  /** The most recent structured result, mirroring what the agent received. */
  readonly lastResult = signal<unknown>(undefined);

  /** Visible action log, kept in sync with every dispatched tool call. */
  readonly actions = signal<readonly ActionRecord[]>([]);

  private readonly handlers = new Map<string, Invoke>();

  detect(global: WebMcpGlobal): void {
    this.status.set(detectWebMcp(global));
  }

  async register(tool: WebMcpTool, invoke: Invoke): Promise<void> {
    const status = this.status();
    if (!status.supported) {
      return;
    }
    await status.api.registerTool(tool);
    this.handlers.set(tool.name, invoke);
    this.registered.update((tools) => [...tools, tool.name]);
  }

  /**
   * Dispatch an agent tool call. Runs the registered handler, records the
   * structured result for the agent, and appends to the visible action log.
   */
  async invoke(name: string, args: unknown): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (handler === undefined) {
      throw new Error(`Unregistered WebMCP tool: ${name}`);
    }
    const result = await handler(args);
    this.lastResult.set(result);
    this.actions.update((actions) => [
      ...actions,
      { tool: name, result, at: new Date().toISOString() },
    ]);
    return result;
  }
}
