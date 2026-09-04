import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  AddressBook,
  createStore,
  loadConfig,
  WorkerClient,
  type ProviderAdapter,
  type ProviderId,
} from '@io/core';
import { createProviders } from '@io/providers';

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * One MCP server per provider. Tools are named `<provider>_*` so several servers
 * can be mounted in the same client without collisions.
 */
export function createProviderServer(provider: ProviderAdapter, addresses: AddressBook): McpServer {
  const server = new McpServer({ name: `india-ordering-${provider.id}`, version: '0.1.0' });

  server.tool(
    `${provider.id}_capabilities`,
    `What ${provider.displayName} can currently do. 'search' and 'prepareCart' need the Tier 1 worker.`,
    {},
    async () => json({ id: provider.id, capabilities: provider.capabilities }),
  );

  server.tool(
    `${provider.id}_deeplink`,
    `Build a ${provider.displayName} search link. Always works, needs no login.`,
    { query: z.string().describe('What to search for') },
    async ({ query }) => json({ provider: provider.id, url: provider.buildSearchDeeplink(query) }),
  );

  server.tool(
    `${provider.id}_search`,
    `Live ${provider.displayName} prices and stock. Returns degraded:"no-worker" when the Tier 1 worker is not running.`,
    {
      query: z.string(),
      addressId: z.string().optional().describe('Saved address label id, defaults to your default'),
    },
    async ({ query, addressId }) => {
      const address = addressId
        ? ((await addresses.get(addressId)) ?? (await addresses.getDefault()))
        : await addresses.getDefault();
      const result = await provider.search?.(query, { addressLabel: address });
      return json(result ?? { provider: provider.id, items: [], degraded: 'no-worker' });
    },
  );

  server.tool(
    `${provider.id}_prepare_cart`,
    `Add items to your real ${provider.displayName} cart. Stops before payment. Needs the Tier 1 worker.`,
    {
      lines: z.array(z.object({ ref: z.string(), name: z.string(), quantity: z.number().int().positive() })),
      addressId: z.string().optional(),
    },
    async ({ lines, addressId }) => {
      const address = addressId
        ? ((await addresses.get(addressId)) ?? (await addresses.getDefault()))
        : await addresses.getDefault();
      try {
        return json(await provider.prepareCart?.(lines, { addressLabel: address }));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'failed' });
      }
    },
  );

  return server;
}

export function createAddressServer(addresses: AddressBook): McpServer {
  const server = new McpServer({ name: 'india-ordering-addresses', version: '0.1.0' });

  server.tool('address_list', 'List saved address labels.', {}, async () =>
    json(await addresses.list()),
  );

  server.tool(
    'address_resolve',
    'Resolve a spoken hint like "home" to a saved address label.',
    { hint: z.string().optional() },
    async ({ hint }) => json(await addresses.resolve(hint)),
  );

  server.tool(
    'address_upsert',
    'Create or update an address label and how it is named in each provider account.',
    {
      id: z.string(),
      displayName: z.string(),
      isDefault: z.boolean().default(false),
      providerLabels: z.record(z.string()).default({}),
    },
    async (input) =>
      json(
        await addresses.upsert({
          id: input.id,
          displayName: input.displayName,
          isDefault: input.isDefault,
          providerLabels: input.providerLabels as Partial<Record<ProviderId, string>>,
        }),
      ),
  );

  server.tool('address_set_default', 'Choose the default address label.', { id: z.string() }, async ({ id }) => {
    await addresses.setDefault(id);
    return json({ ok: true, default: id });
  });

  return server;
}

/** Entrypoint shared by every bin/*.ts stub. */
export async function serveStdio(which: ProviderId | 'addresses'): Promise<void> {
  const config = loadConfig();
  const store = createStore(config.redis, config.keyPrefix);
  const addresses = new AddressBook(store);

  const server =
    which === 'addresses'
      ? createAddressServer(addresses)
      : createProviderServer(createProviders(new WorkerClient(config.worker))[which], addresses);

  await server.connect(new StdioServerTransport());
}
