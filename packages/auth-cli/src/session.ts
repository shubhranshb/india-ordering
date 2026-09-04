import { open, seal, type ProviderId, type Store } from '@io/core';

export interface StoredSession {
  sealed: string;
  capturedAt: number;
  /** Cleared by the worker when it hits a login wall. */
  healthy: boolean;
  cookieCount: number;
}

export function sessionKey(provider: ProviderId): string {
  return `session:${provider}`;
}

export async function saveSession(
  store: Store,
  provider: ProviderId,
  storageState: unknown,
  encryptionKey: string,
): Promise<StoredSession> {
  const raw = JSON.stringify(storageState);
  const cookies = (storageState as { cookies?: unknown[] }).cookies ?? [];

  const session: StoredSession = {
    sealed: seal(raw, encryptionKey),
    capturedAt: Date.now(),
    healthy: true,
    cookieCount: cookies.length,
  };
  await store.set(sessionKey(provider), session);
  return session;
}

export async function loadSession(
  store: Store,
  provider: ProviderId,
  encryptionKey: string,
): Promise<unknown | null> {
  const session = await store.get<StoredSession>(sessionKey(provider));
  if (!session) return null;
  return JSON.parse(open(session.sealed, encryptionKey));
}

export async function markStale(store: Store, provider: ProviderId): Promise<void> {
  const session = await store.get<StoredSession>(sessionKey(provider));
  if (session) await store.set(sessionKey(provider), { ...session, healthy: false });
}
