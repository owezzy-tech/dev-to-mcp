import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  detectWebMcp,
  WebMcpService,
  type WebMcpApi,
  type WebMcpGlobal,
} from './webmcp.service';

class FakeWebMcp implements WebMcpApi {
  registered: string[] = [];
  async registerTool(): Promise<void> {}
  async listTools(): Promise<readonly string[]> {
    return this.registered;
  }
}

describe('detectWebMcp', () => {
  it('reports unsupported when the browser lacks WebMCP', () => {
    const status = detectWebMcp({});
    expect(status.supported).toBe(false);
    if (!status.supported) {
      expect(status.reason).toContain('not supported');
    }
  });

  it('reports supported when the browser exposes WebMCP', () => {
    const api = new FakeWebMcp();
    const status = detectWebMcp({ webmcp: api });
    expect(status.supported).toBe(true);
  });
});

describe('WebMcpService', () => {
  it('registers tools only when WebMCP is supported', async () => {
    const service = TestBed.inject(WebMcpService);

    service.detect({});
    await service.register(
      { name: 'get_articles', description: 'list' },
      async () => [],
    );
    expect(service.registered()).toEqual([]);

    service.detect({ webmcp: new FakeWebMcp() });
    await service.register(
      { name: 'get_articles', description: 'list' },
      async () => [],
    );
    expect(service.registered()).toEqual(['get_articles']);
  });

  it('keeps the structured result and action log in sync on invoke', async () => {
    const service = TestBed.inject(WebMcpService);
    service.detect({ webmcp: new FakeWebMcp() });
    await service.register(
      { name: 'search', description: 'search' },
      async (args) => ({ query: (args as { q: string }).q, hits: 3 }),
    );

    const result = await service.invoke('search', { q: 'angular' });

    expect(result).toEqual({ query: 'angular', hits: 3 });
    expect(service.lastResult()).toEqual({ query: 'angular', hits: 3 });
    expect(service.actions().length).toBe(1);
    expect(service.actions()[0]?.tool).toBe('search');
  });

  it('rejects invocation of an unregistered tool', async () => {
    const service = TestBed.inject(WebMcpService);
    await expect(service.invoke('missing', {})).rejects.toThrow(
      /Unregistered WebMCP tool/,
    );
  });
});
