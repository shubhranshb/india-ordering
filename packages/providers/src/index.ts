import type { ProviderAdapter, ProviderCategory, ProviderId, WorkerClient } from '@io/core';
import { createAdapter } from './adapter.js';

export { buildSearchUrl, LOGIN_URLS, SEARCH_URLS } from './links.js';
export { createAdapter } from './adapter.js';

const SPECS: {
  id: ProviderId;
  displayName: string;
  category: ProviderCategory;
  workerBacked?: boolean;
}[] = [
  { id: 'zepto', displayName: 'Zepto', category: 'quick-commerce' },
  { id: 'blinkit', displayName: 'Blinkit', category: 'quick-commerce' },
  { id: 'instamart', displayName: 'Swiggy Instamart', category: 'quick-commerce' },
  { id: 'bigbasket', displayName: 'BigBasket', category: 'quick-commerce' },
  { id: 'swiggy-food', displayName: 'Swiggy Food', category: 'food' },
  { id: 'zomato', displayName: 'Zomato', category: 'food' },
  // Amazon has no legal catalog scrape path; PA-API would be a separate integration.
  { id: 'amazon', displayName: 'Amazon India', category: 'marketplace', workerBacked: false },
];

export function createProviders(worker: WorkerClient): Record<ProviderId, ProviderAdapter> {
  const entries = SPECS.map((spec) => [spec.id, createAdapter(spec, worker)] as const);
  return Object.fromEntries(entries) as Record<ProviderId, ProviderAdapter>;
}

export function providersFor(
  all: Record<ProviderId, ProviderAdapter>,
  category: ProviderCategory,
): ProviderAdapter[] {
  return Object.values(all).filter((p) => p.category === category);
}

export const PROVIDER_IDS = SPECS.map((s) => s.id);
