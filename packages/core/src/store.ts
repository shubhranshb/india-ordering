import { Redis } from '@upstash/redis';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Returns false when the key already existed — used for update_id dedupe. */
  setIfAbsent(key: string, ttlSeconds: number): Promise<boolean>;
}

/**
 * Every key is namespaced so two deployments can share one Upstash DB without
 * seeing each other's data.
 */
function namespaced(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

export class RedisStore implements Store {
  private redis: Redis;

  constructor(
    config: { url: string; token: string },
    private prefix: string,
  ) {
    this.redis = new Redis({ url: config.url, token: config.token });
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(namespaced(this.prefix, key))) ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const k = namespaced(this.prefix, key);
    if (ttlSeconds) await this.redis.set(k, value, { ex: ttlSeconds });
    else await this.redis.set(k, value);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(namespaced(this.prefix, key));
  }

  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(namespaced(this.prefix, key), 1, { nx: true, ex: ttlSeconds });
    return res === 'OK';
  }
}

/** Offline fallback for the CLI. Not used on Vercel. */
export class FileStore implements Store {
  private path: string;
  private data: Record<string, { value: unknown; expiresAt: number | null }>;

  constructor(private prefix: string, path = join(homedir(), '.india-ordering', 'state.json')) {
    this.path = path;
    try {
      this.data = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data[namespaced(this.prefix, key)];
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) return null;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.data[namespaced(this.prefix, key)] = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    };
    this.flush();
  }

  async del(key: string): Promise<void> {
    delete this.data[namespaced(this.prefix, key)];
    this.flush();
  }

  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    if ((await this.get(key)) !== null) return false;
    await this.set(key, 1, ttlSeconds);
    return true;
  }
}

export function createStore(
  redis: { url: string; token: string } | null,
  prefix: string,
): Store {
  return redis ? new RedisStore(redis, prefix) : new FileStore(prefix);
}
