import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStore } from '@io/core';
import { loadSession, markStale, saveSession, sessionKey } from '../src/session.js';
import type { StoredSession } from '../src/session.js';

const key = randomBytes(32).toString('hex');

function store(prefix = 'auth-test') {
  return new FileStore(prefix, join(tmpdir(), `io-auth-${Date.now()}-${Math.random()}.json`));
}

const storageState = {
  cookies: [{ name: 'sid', value: 'super-secret', domain: '.zeptonow.com' }],
  origins: [],
};

describe('session storage', () => {
  it('round-trips a captured session', async () => {
    const s = store();
    await saveSession(s, 'zepto', storageState, key);
    expect(await loadSession(s, 'zepto', key)).toEqual(storageState);
  });

  it('never stores the cookie value in plaintext', async () => {
    const s = store();
    await saveSession(s, 'zepto', storageState, key);
    const raw = JSON.stringify(await s.get<StoredSession>(sessionKey('zepto')));
    expect(raw).not.toContain('super-secret');
  });

  it('cannot be read with another deployment key', async () => {
    const s = store();
    await saveSession(s, 'zepto', storageState, key);
    await expect(loadSession(s, 'zepto', randomBytes(32).toString('hex'))).rejects.toThrow();
  });

  it('returns null when nothing was captured', async () => {
    expect(await loadSession(store(), 'blinkit', key)).toBeNull();
  });

  it('marks a session stale without destroying it', async () => {
    const s = store();
    await saveSession(s, 'zepto', storageState, key);
    await markStale(s, 'zepto');

    const stored = await s.get<StoredSession>(sessionKey('zepto'));
    expect(stored?.healthy).toBe(false);
    expect(await loadSession(s, 'zepto', key)).toEqual(storageState);
  });

  it('keeps two people apart via KEY_PREFIX', async () => {
    const path = join(tmpdir(), `io-auth-shared-${Date.now()}.json`);
    const mine = new FileStore('sid', path);
    const hers = new FileStore('wife', path);

    await saveSession(mine, 'zepto', storageState, key);
    expect(await loadSession(hers, 'zepto', key)).toBeNull();
  });
});
