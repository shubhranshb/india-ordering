import {
  AddressBook,
  type ProviderAdapter,
  type ProviderCategory,
  type ProviderId,
  type SearchResult,
  type Store,
} from '@io/core';
import type { ToolSchema } from './llm.js';

export interface ToolContext {
  providers: Record<ProviderId, ProviderAdapter>;
  addresses: AddressBook;
  store: Store;
}

/** Result of a turn, used by the UI layers to render buttons. */
export interface OrderOption {
  provider: ProviderId;
  displayName: string;
  deeplink: string;
  result?: SearchResult;
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'resolve_address',
    description:
      'Resolve which saved delivery address to use. Call this before any search or link. Returns the label and how it is named in each provider account.',
    parameters: {
      type: 'object',
      properties: {
        hint: {
          type: 'string',
          description: 'What the user called it, e.g. "home", "office". Omit to use the default.',
        },
      },
    },
  },
  {
    name: 'list_addresses',
    description: 'List every saved address label.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_providers',
    description:
      'Search a category of providers for an item and get deep-links. Returns live prices only when the Tier 1 worker is running; otherwise items is empty and degraded is "no-worker", which is normal.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "amul taaza 2L"' },
        category: {
          type: 'string',
          enum: ['quick-commerce', 'food', 'marketplace'],
          description: 'quick-commerce for groceries, food for restaurants, marketplace for Amazon',
        },
        addressId: { type: 'string', description: 'Address id from resolve_address' },
      },
      required: ['query', 'category', 'addressId'],
    },
  },
  {
    name: 'save_last_order',
    description: 'Remember what was ordered so "the usual" works next time.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        provider: { type: 'string' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'get_last_order',
    description: 'Recall the previous order for "the usual" or "same as last time".',
    parameters: { type: 'object', properties: {} },
  },
];

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  collected: OrderOption[],
): Promise<string> {
  switch (name) {
    case 'resolve_address': {
      const address = await ctx.addresses.resolve(args.hint as string | undefined);
      return JSON.stringify(address);
    }

    case 'list_addresses':
      return JSON.stringify(await ctx.addresses.list());

    case 'search_providers': {
      const query = String(args.query ?? '');
      const category = args.category as ProviderCategory;
      const address =
        (await ctx.addresses.get(String(args.addressId ?? ''))) ??
        (await ctx.addresses.getDefault());

      const matching = Object.values(ctx.providers).filter((p) => p.category === category);
      const results = await Promise.all(
        matching.map(async (provider) => {
          const deeplink = provider.buildSearchDeeplink(query);
          const result = await provider.search?.(query, { addressLabel: address });
          collected.push({
            provider: provider.id,
            displayName: provider.displayName,
            deeplink,
            result,
          });
          return {
            provider: provider.id,
            displayName: provider.displayName,
            degraded: result?.degraded,
            items: result?.items.slice(0, 3) ?? [],
            etaMinutes: result?.etaMinutes,
          };
        }),
      );
      return JSON.stringify({ address: address.displayName, results });
    }

    case 'save_last_order':
      await ctx.store.set('last-order', { ...args, at: Date.now() });
      return 'saved';

    case 'get_last_order':
      return JSON.stringify((await ctx.store.get('last-order')) ?? { none: true });

    default:
      return `Unknown tool: ${name}`;
  }
}
