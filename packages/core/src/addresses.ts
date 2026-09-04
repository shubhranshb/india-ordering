import type { AddressLabel, ProviderId } from './types.js';
import type { Store } from './store.js';

const KEY = 'addresses';

const SEED: AddressLabel[] = [
  { id: 'home', displayName: 'Home', isDefault: true, providerLabels: {} },
];

export class AddressBook {
  constructor(private store: Store) {}

  async list(): Promise<AddressLabel[]> {
    return (await this.store.get<AddressLabel[]>(KEY)) ?? SEED;
  }

  async get(id: string): Promise<AddressLabel | null> {
    return (await this.list()).find((a) => a.id === id) ?? null;
  }

  async getDefault(): Promise<AddressLabel> {
    const all = await this.list();
    return all.find((a) => a.isDefault) ?? all[0] ?? SEED[0]!;
  }

  /** Resolves "home", "Home", "office" or a display name; falls back to the default. */
  async resolve(hint?: string): Promise<AddressLabel> {
    if (!hint) return this.getDefault();
    const needle = hint.trim().toLowerCase();
    const all = await this.list();
    return (
      all.find((a) => a.id.toLowerCase() === needle) ??
      all.find((a) => a.displayName.toLowerCase() === needle) ??
      all.find((a) => a.displayName.toLowerCase().includes(needle)) ??
      (await this.getDefault())
    );
  }

  async upsert(entry: AddressLabel): Promise<AddressLabel[]> {
    const all = await this.list();
    const next = all.filter((a) => a.id !== entry.id).concat(entry);
    if (entry.isDefault) {
      for (const a of next) a.isDefault = a.id === entry.id;
    }
    await this.store.set(KEY, next);
    return next;
  }

  async setDefault(id: string): Promise<void> {
    const all = await this.list();
    if (!all.some((a) => a.id === id)) throw new Error(`No address labelled "${id}"`);
    for (const a of all) a.isDefault = a.id === id;
    await this.store.set(KEY, all);
  }

  async remove(id: string): Promise<void> {
    const all = (await this.list()).filter((a) => a.id !== id);
    await this.store.set(KEY, all);
  }
}

/**
 * What this address is called inside a given provider's saved-address list.
 * Falls back to the display name, which is right whenever the user used the
 * same word in both places.
 */
export function providerLabelFor(address: AddressLabel, provider: ProviderId): string {
  return address.providerLabels[provider] ?? address.displayName;
}
