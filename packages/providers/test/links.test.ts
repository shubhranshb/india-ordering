import { describe, expect, it } from 'vitest';
import { WorkerClient } from '@io/core';
import { createProviders, PROVIDER_IDS } from '../src/index.js';
import { buildSearchUrl } from '../src/links.js';

const noWorker = new WorkerClient(null);

describe('deep-links', () => {
  it('builds a valid absolute https URL for every provider', () => {
    for (const id of PROVIDER_IDS) {
      const url = new URL(buildSearchUrl(id, 'amul milk'));
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toMatch(/\.(com|in)$/);
    }
  });

  it('encodes queries so spaces and symbols cannot break the URL', () => {
    const url = buildSearchUrl('zepto', 'amul milk & eggs');
    expect(url).not.toContain(' ');
    expect(new URL(url).searchParams.get('query')).toBe('amul milk & eggs');
  });

  it('trims surrounding whitespace', () => {
    expect(new URL(buildSearchUrl('amazon', '  kindle  ')).searchParams.get('k')).toBe('kindle');
  });
});

describe('capabilities without a worker (Tier 0)', () => {
  const providers = createProviders(noWorker);

  it('offers deep-links only', () => {
    for (const id of PROVIDER_IDS) {
      expect(providers[id].capabilities).toEqual(['deeplink']);
    }
  });

  it('degrades search instead of throwing', async () => {
    const ctx = {
      addressLabel: { id: 'home', displayName: 'Home', isDefault: true, providerLabels: {} },
    };
    const result = await providers.zepto.search!('milk', ctx);
    expect(result.degraded).toBe('no-worker');
    expect(result.items).toEqual([]);
  });

  it('refuses to prepare a cart rather than pretending', async () => {
    const ctx = {
      addressLabel: { id: 'home', displayName: 'Home', isDefault: true, providerLabels: {} },
    };
    await expect(providers.zepto.prepareCart!([], ctx)).rejects.toThrow(/Tier 1 worker/);
  });
});
