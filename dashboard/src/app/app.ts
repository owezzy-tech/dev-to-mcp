import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from './services/api.service';
import {
  WebMcpService,
  type WebMcpGlobal,
} from './services/webmcp.service';

interface DraftSummary {
  readonly id: string;
  readonly state: string;
}

interface AuditEvent {
  readonly tool: string;
  readonly actorType: string;
  readonly result: string;
  readonly createdAtMs: number;
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(ApiService);
  private readonly webmcp = inject(WebMcpService);

  readonly capabilities = signal<readonly string[]>([]);
  readonly webmcpStatus = this.webmcp.status;
  readonly registered = this.webmcp.registered;
  readonly actions = this.webmcp.actions;
  readonly lastResult = this.webmcp.lastResult;

  readonly webmcpSupported = computed(() => this.webmcp.status().supported);
  readonly webmcpMessage = computed(() => {
    const status = this.webmcp.status();
    return status.supported
      ? `WebMCP detected. Registered tools: ${this.registered().join(', ') || 'none yet'}.`
      : status.reason;
  });

  readonly token = this.api.token;
  readonly draftMarkdown = signal('');
  readonly draftId = signal<string | undefined>(undefined);
  readonly draftState = signal('none');
  readonly audit = signal<readonly AuditEvent[]>([]);

  constructor() {
    this.webmcp.detect(globalThis as unknown as WebMcpGlobal);
    void this.registerTools();
  }

  private async registerTools(): Promise<void> {
    await this.webmcp.register(
      { name: 'get_articles', description: 'List public DEV.to articles.' },
      async () => this.api.get<unknown[]>('/articles'),
    );
    await this.webmcp.register(
      { name: 'list_capabilities', description: 'List author capabilities.' },
      async () => this.api.get<string[]>('/me/capabilities'),
    );
    await this.webmcp.register(
      { name: 'approve_draft', description: 'Approve a draft for publication.' },
      async (args) =>
        this.api.post<unknown>(
          `/drafts/${(args as { id: string }).id}/approve`,
          { decision: 'APPROVED', ttlSeconds: 600 },
        ),
    );
  }

  signIn(token: string): void {
    this.api.token.set(token);
    void this.loadCapabilities();
  }

  async loadCapabilities(): Promise<void> {
    if (this.api.token() === undefined) {
      return;
    }
    this.capabilities.set(await this.api.get<string[]>('/me/capabilities'));
  }

  async runSearch(): Promise<void> {
    await this.webmcp.invoke('get_articles', {});
    await this.webmcp.invoke('list_capabilities', {});
  }

  async persistDraft(markdown: string): Promise<void> {
    const result = await this.api.post<{ draft: DraftSummary }>('/drafts', {
      title: 'Generated draft',
      tags: ['angular'],
      markdown,
    });
    this.draftId.set(result.draft.id);
    this.draftState.set(result.draft.state);
    this.appendAudit('create_draft');
  }

  async approveDraft(): Promise<void> {
    const id = this.draftId();
    if (id === undefined) {
      return;
    }
    await this.webmcp.invoke('approve_draft', { id });
    this.draftState.set('APPROVED');
    this.appendAudit('approve_draft');
  }

  async loadAudit(): Promise<void> {
    const id = this.draftId();
    if (id === undefined) {
      return;
    }
    this.audit.set(await this.api.get<AuditEvent[]>(`/drafts/${id}/audit`));
  }

  private appendAudit(tool: string): void {
    this.audit.update((entries) => [
      ...entries,
      { tool, actorType: 'AUTHOR', result: 'ok', createdAtMs: Date.now() },
    ]);
  }
}
