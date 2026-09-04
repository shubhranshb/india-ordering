/** Capability tiers. Every provider has `deeplink`; the rest need the Tier 1 worker. */
export type Capability = 'deeplink' | 'search' | 'prepareCart';

export type ProviderCategory = 'quick-commerce' | 'food' | 'marketplace';

export type ProviderId =
  | 'zepto'
  | 'blinkit'
  | 'instamart'
  | 'swiggy-food'
  | 'zomato'
  | 'amazon'
  | 'bigbasket';

/**
 * An address is never stored here — only what it is *called* in each provider
 * account. The provider profile stays the source of truth.
 */
export interface AddressLabel {
  id: string;
  displayName: string;
  isDefault: boolean;
  /** provider id -> the label as it appears in that provider's saved addresses */
  providerLabels: Partial<Record<ProviderId, string>>;
}

export interface SearchItem {
  name: string;
  price?: number;
  unit?: string;
  inStock: boolean;
  imageUrl?: string;
  productUrl?: string;
  /** opaque handle the worker needs to add this exact item to the cart */
  ref?: string;
}

export interface SearchResult {
  provider: ProviderId;
  items: SearchItem[];
  etaMinutes?: number;
  serviceable: boolean;
  /** set when the provider was skipped rather than genuinely empty */
  degraded?: 'no-worker' | 'session-stale' | 'not-serviceable' | 'error';
  note?: string;
}

export interface CartLine {
  ref: string;
  name: string;
  quantity: number;
}

export interface PreparedCart {
  provider: ProviderId;
  cartUrl: string;
  total?: number;
  lines: CartLine[];
}

/** Passed to worker-backed operations so the worker knows which saved address to select. */
export interface OrderContext {
  addressLabel: AddressLabel;
}

export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  category: ProviderCategory;
  capabilities: Capability[];
  /** where `pnpm auth <id>` sends the browser for the one-time login */
  loginUrl: string;
  /** Always available, needs no credentials and no worker. */
  buildSearchDeeplink(query: string): string;
  search?(query: string, ctx: OrderContext): Promise<SearchResult>;
  prepareCart?(lines: CartLine[], ctx: OrderContext): Promise<PreparedCart>;
}

export interface Draft {
  id: string;
  query: string;
  addressId: string;
  createdAt: number;
  results: SearchResult[];
  /** provider -> cart already prepared, so a double-tap is a no-op */
  prepared: Partial<Record<ProviderId, PreparedCart>>;
}
