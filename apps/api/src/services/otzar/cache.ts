// FILE: cache.ts
// PURPOSE: Generic key-value cache with TTL. Section 11B priming
//          needs get-with-value semantics that NonceStore (presence-
//          only) cannot serve. Two implementations: MemoryKVCache
//          for tests + REDIS_URL-less envs, RedisKVCache via ioredis
//          for production.
// CONNECTS TO: otzar.service.ts (priming cache), tests/unit/otzar.test.ts.

import Redis from "ioredis";

// WHAT: The key-value-cache contract.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: get returns null on miss; set takes ttl in seconds; delete
//      is fire-and-forget. Three methods cover everything Section
//      11B needs without bloating the interface.
export interface KVCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// WHAT: In-memory KVCache for tests + REDIS_URL-less envs.
// INPUT: None at construction.
// OUTPUT: A KVCache instance.
// WHY: Tests need deterministic cache state without a network
//      dependency. TTL honored via stored expiresAt timestamp;
//      lazy purge on get/delete -- no background timers.
export class MemoryKVCache implements KVCache {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

// WHAT: A KVCache backed by a real ioredis client.
// INPUT: An ioredis client + an optional key prefix.
// OUTPUT: A KVCache instance.
// WHY: Production uses Upstash; key prefix scopes the cache so
//      it doesn't collide with other Redis users sharing the same
//      DB. SET key value EX ttl is the canonical TTL pattern.
export class RedisKVCache implements KVCache {
  private readonly keyPrefix: string;

  constructor(
    private readonly client: Redis,
    keyPrefix: string = "niov:kv:",
  ) {
    this.keyPrefix = keyPrefix;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.keyPrefix + key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.keyPrefix + key, value, "EX", ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.keyPrefix + key);
  }
}

// WHAT: Pick the right KVCache for the current environment.
// INPUT: None.
// OUTPUT: A KVCache instance.
// WHY: Production reads REDIS_URL; tests use the memory cache.
//      NODE_ENV=test always picks memory regardless of REDIS_URL
//      so a stale .env doesn't pollute test runs against real Redis.
export function makeDefaultKVCache(): KVCache {
  if (process.env.NODE_ENV === "test") {
    return new MemoryKVCache();
  }
  const url = process.env.REDIS_URL;
  if (typeof url !== "string" || url.length === 0) {
    return new MemoryKVCache();
  }
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  return new RedisKVCache(client);
}
