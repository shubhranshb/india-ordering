import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { open, safeEqual, seal } from '../src/crypto.js';
import { redact } from '../src/redact.js';
import { AddressBook } from '../src/addresses.js';
import { FileStore } from '../src/store.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const key = randomBytes(32).toString('hex');

describe('session sealing', () => {
  it('round-trips a storageState blob', () => {
    const payload = JSON.stringify({ cookies: [{ name: 'session', value: 'abc' }] });
    expect(open(seal(payload, key), key)).toBe(payload);
  });

  it('produces different ciphertext each time', () => {
    expect(seal('same', key)).not.toBe(seal('same', key));
  });

  it('refuses a payload sealed with another deployment key', () => {
    const otherKey = randomBytes(32).toString('hex');
    expect(() => open(seal('secret', key), otherKey)).toThrow();
  });

  it('rejects a tampered payload', () => {
    const [iv, tag, data] = seal('secret', key).split('.');
    expect(() => open(`${iv}.${tag}.${data}x`, key)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => seal('x', 'abcd')).toThrow(/32 bytes/);
  });
});

describe('safeEqual', () => {
  it('matches identical strings and rejects others', () => {
    expect(safeEqual('token', 'token')).toBe(true);
    expect(safeEqual('token', 'tokeN')).toBe(false);
    expect(safeEqual('token', 'longer-token')).toBe(false);
  });
});

describe('redact', () => {
  it('strips cookies, tokens and phone numbers', () => {
    const out = redact({
      cookies: [{ name: 'sid', value: 'secret' }],
      phone: '9876543210',
      note: 'call me on +91 9876543210',
      quantity: 2,
    }) as Record<string, unknown>;

    expect(out.cookies).toBe('[redacted]');
    expect(out.phone).toBe('[redacted]');
    expect(out.note).toBe('call me on [phone]');
    expect(out.quantity).toBe(2);
  });
});

describe('AddressBook', () => {
  const store = new FileStore('test', join(tmpdir(), `io-test-${Date.now()}.json`));
  const book = new AddressBook(store);

  it('seeds a default Home label', async () => {
    expect((await book.getDefault()).id).toBe('home');
  });

  it('resolves by id, display name and partial match', async () => {
    await book.upsert({
      id: 'office',
      displayName: 'Office',
      isDefault: false,
      providerLabels: { zepto: 'Work' },
    });
    expect((await book.resolve('office')).id).toBe('office');
    expect((await book.resolve('Office')).id).toBe('office');
    expect((await book.resolve('offi')).id).toBe('office');
  });

  it('falls back to the default for an unknown hint', async () => {
    expect((await book.resolve('mars')).id).toBe('home');
  });

  it('keeps exactly one default', async () => {
    await book.upsert({
      id: 'office',
      displayName: 'Office',
      isDefault: true,
      providerLabels: {},
    });
    expect((await book.list()).filter((a) => a.isDefault)).toHaveLength(1);
  });
});

describe('store namespacing', () => {
  it('keeps two deployments apart in one file', async () => {
    const path = join(tmpdir(), `io-ns-${Date.now()}.json`);
    const mine = new FileStore('sid', path);
    const hers = new FileStore('wife', path);

    await mine.set('addresses', ['mine']);
    expect(await hers.get('addresses')).toBeNull();
  });

  it('setIfAbsent returns false the second time (update_id dedupe)', async () => {
    const store = new FileStore('dedupe', join(tmpdir(), `io-dd-${Date.now()}.json`));
    expect(await store.setIfAbsent('update:1', 60)).toBe(true);
    expect(await store.setIfAbsent('update:1', 60)).toBe(false);
  });
});
