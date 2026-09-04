import {
  providerLabelFor,
  type CartLine,
  type OrderContext,
  type PreparedCart,
  type ProviderAdapter,
  type ProviderCategory,
  type ProviderId,
  type SearchResult,
  type WorkerClient,
} from '@io/core';
import { buildSearchUrl, LOGIN_URLS } from './links.js';

interface Spec {
  id: ProviderId;
  displayName: string;
  category: ProviderCategory;
  /** false for providers whose catalog we never scrape (Amazon uses PA-API instead) */
  workerBacked?: boolean;
}

/**
 * All seven providers share one implementation: deep-links are built locally,
 * search and cart are delegated to the Tier 1 worker when it is configured.
 */
export function createAdapter(spec: Spec, worker: WorkerClient): ProviderAdapter {
  const workerBacked = spec.workerBacked ?? true;
  const canUseWorker = workerBacked && worker.available;

  return {
    id: spec.id,
    displayName: spec.displayName,
    category: spec.category,
    capabilities: canUseWorker ? ['deeplink', 'search', 'prepareCart'] : ['deeplink'],
    loginUrl: LOGIN_URLS[spec.id],

    buildSearchDeeplink(query: string): string {
      return buildSearchUrl(spec.id, query);
    },

    async search(query: string, ctx: OrderContext): Promise<SearchResult> {
      if (!canUseWorker) {
        return { provider: spec.id, items: [], serviceable: true, degraded: 'no-worker' };
      }
      return worker.search(spec.id, query, providerLabelFor(ctx.addressLabel, spec.id));
    },

    async prepareCart(lines: CartLine[], ctx: OrderContext): Promise<PreparedCart> {
      if (!canUseWorker) {
        throw new Error(
          `${spec.displayName} cannot fill a cart without the Tier 1 worker — use the deep-link instead.`,
        );
      }
      const idempotencyKey = `${spec.id}:${ctx.addressLabel.id}:${lines
        .map((l) => `${l.ref}x${l.quantity}`)
        .sort()
        .join('|')}`;
      return worker.prepareCart(
        spec.id,
        lines,
        providerLabelFor(ctx.addressLabel, spec.id),
        idempotencyKey,
      );
    },
  };
}
