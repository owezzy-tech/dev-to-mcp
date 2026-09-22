import { Injectable, signal } from '@angular/core';

/**
 * Thin REST client for the versioned backend API. It never holds the DEV.to
 * API key — that stays server-side (FR-061). The session token is the only
 * credential this client sends, and only for authenticated routes.
 */

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly baseUrl = signal('/v1');
  readonly token = signal<string | undefined>(undefined);

  private readonly _error = signal<ApiError | undefined>(undefined);
  readonly error = this._error.asReadonly();

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = this.token();
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const error = (payload as { error?: ApiError }).error;
      if (error !== undefined) {
        this._error.set(error);
      }
      throw new Error(`API request failed (${response.status})`);
    }
    this._error.set(undefined);
    return payload as T;
  }
}
