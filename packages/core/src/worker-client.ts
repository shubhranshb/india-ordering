import type { CartLine, PreparedCart, ProviderId, SearchResult } from './types.js';

export interface WorkerConfig {
  url: string;
  token: string;
}

/**
 * Tier 1 only. When no worker is configured every call reports `no-worker` and
 * callers fall back to deep-links rather than failing.
 */
export class WorkerClient {
  constructor(
    private config: WorkerConfig | null,
    private timeoutMs = 45_000,
  ) {}

  get available(): boolean {
    return this.config !== null;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.config) throw new Error('no-worker');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.config.url}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`worker ${path} returned ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async search(
    provider: ProviderId,
    query: string,
    addressLabel: string,
  ): Promise<SearchResult> {
    if (!this.config) {
      return { provider, items: [], serviceable: true, degraded: 'no-worker' };
    }
    try {
      return await this.post<SearchResult>('/search', { provider, query, addressLabel });
    } catch (error) {
      return {
        provider,
        items: [],
        serviceable: true,
        degraded: error instanceof Error && error.message.includes('401') ? 'session-stale' : 'error',
      };
    }
  }

  async prepareCart(
    provider: ProviderId,
    lines: CartLine[],
    addressLabel: string,
    idempotencyKey: string,
  ): Promise<PreparedCart> {
    return this.post<PreparedCart>('/prepare-cart', {
      provider,
      lines,
      addressLabel,
      idempotencyKey,
    });
  }

  async sessionHealth(): Promise<Record<string, { healthy: boolean; capturedAt?: number }>> {
    if (!this.config) return {};
    const res = await fetch(`${this.config.url}/health/sessions`, {
      headers: { authorization: `Bearer ${this.config.token}` },
    });
    if (!res.ok) throw new Error(`worker health returned ${res.status}`);
    return (await res.json()) as Record<string, { healthy: boolean; capturedAt?: number }>;
  }
}
