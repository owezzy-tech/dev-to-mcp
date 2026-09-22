import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './app';
import type { WebMcpApi } from './services/webmcp.service';

class FakeWebMcp implements WebMcpApi {
  async registerTool(): Promise<void> {}
  async listTools(): Promise<readonly string[]> {
    return [];
  }
}

async function renderApp(): Promise<HTMLElement> {
  await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  delete (globalThis as { webmcp?: unknown }).webmcp;
});

describe('App dashboard', () => {
  it('renders the dashboard shell with an accessible heading', async () => {
    const el = await renderApp();
    expect(el.querySelector('h1')?.textContent).toContain('Dashboard');
  });

  it('shows setup guidance when WebMCP is unsupported', async () => {
    const el = await renderApp();
    const banner = el.querySelector('p.banner') as HTMLElement;
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.classList.contains('banner--warn')).toBe(true);
    expect(banner.textContent).toContain('not supported');
  });

  it('announces WebMCP support when the browser exposes it', async () => {
    (globalThis as { webmcp?: unknown }).webmcp = new FakeWebMcp();
    const el = await renderApp();
    const banner = el.querySelector('p.banner') as HTMLElement;
    expect(banner.classList.contains('banner--ok')).toBe(true);
    expect(banner.textContent).toContain('WebMCP detected');
  });

  it('labels form controls and exposes a live region for the action log', async () => {
    const el = await renderApp();
    const tokenInput = el.querySelector('#session-token') as HTMLInputElement;
    const label = el.querySelector('label[for="session-token"]');
    expect(label).toBeTruthy();
    expect(tokenInput.getAttribute('type')).toBe('password');

    const live = el.querySelector('[aria-live]') as HTMLElement;
    expect(live).toBeTruthy();
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('disables the approve button until a draft exists', async () => {
    const el = await renderApp();
    const approve = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Approve'),
    ) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
  });
});
