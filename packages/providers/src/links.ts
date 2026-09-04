import type { ProviderId } from '@io/core';

/**
 * Every outbound URL in the project. These are public web search URLs, verified
 * by hand — when a provider changes its URL shape, this is the only file to fix.
 * Run `pnpm test` after editing; the tests pin the shapes.
 */
export const SEARCH_URLS: Record<ProviderId, (q: string) => string> = {
  zepto: (q) => `https://www.zeptonow.com/search?query=${q}`,
  blinkit: (q) => `https://blinkit.com/s/?q=${q}`,
  instamart: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${q}`,
  'swiggy-food': (q) => `https://www.swiggy.com/search?query=${q}`,
  zomato: (q) => `https://www.zomato.com/india/search?q=${q}`,
  amazon: (q) => `https://www.amazon.in/s?k=${q}`,
  bigbasket: (q) => `https://www.bigbasket.com/ps/?q=${q}`,
};

export const LOGIN_URLS: Record<ProviderId, string> = {
  zepto: 'https://www.zeptonow.com/',
  blinkit: 'https://blinkit.com/',
  instamart: 'https://www.swiggy.com/instamart',
  'swiggy-food': 'https://www.swiggy.com/',
  zomato: 'https://www.zomato.com/',
  amazon: 'https://www.amazon.in/ap/signin',
  bigbasket: 'https://www.bigbasket.com/',
};

export function buildSearchUrl(provider: ProviderId, query: string): string {
  return SEARCH_URLS[provider](encodeURIComponent(query.trim()));
}
