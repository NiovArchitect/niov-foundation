// FILE: redis.ts
// PURPOSE: One place to construct the Redis-backed nonce store. Falls
//          back to an in-memory store when REDIS_URL is missing so
//          tests do not require a live Redis server.
// CONNECTS TO: The auth service in /services/auth.service.ts. The
//              nonce store is the second factor that distinguishes a
//              valid in-flight session from a JWT that has been
//              revoked or has expired in Redis.

import Redis from "ioredis";

// WHAT: The contract every nonce store implementation has to honor.
// INPUT: Used as a parameter type for the auth service.
// OUTPUT: None -- this is a type, not a value.
// WHY: Letting the auth service depend on this interface (instead of
//      Redis directly) lets tests swap in an in-memory store and
//      production swap in real Redis without changing service code.
export interface NonceStore {
  set(sessionId: string, ttlSeconds: number): Promise<void>;
  has(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<void>;
}

// WHAT: An in-memory NonceStore that respects TTL via setTimeout.
// INPUT: None at construction.
// OUTPUT: An object satisfying NonceStore.
// WHY: When REDIS_URL is unset (typical for tests) we still need a
//      working store. The implementation honors TTL so expiry-based
//      tests behave the same way they would against real Redis.
export class MemoryNonceStore implements NonceStore {
  private readonly entries = new Map<string, NodeJS.Timeout>();

  async set(sessionId: string, ttlSeconds: number): Promise<void> {
    const existing = this.entries.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);
    const handle = setTimeout(() => {
      this.entries.delete(sessionId);
    }, ttlSeconds * 1000);
    // unref so an unfired timeout does not hold the test process open
    handle.unref?.();
    this.entries.set(sessionId, handle);
  }

  async has(sessionId: string): Promise<boolean> {
    return this.entries.has(sessionId);
  }

  async delete(sessionId: string): Promise<void> {
    const existing = this.entries.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);
    this.entries.delete(sessionId);
  }
}

// WHAT: A NonceStore backed by a real ioredis client.
// INPUT: An ioredis Redis instance.
// OUTPUT: An object satisfying NonceStore.
// WHY: Production needs a shared store across processes. ioredis
//      handles reconnection, clustering, and pipelining for us.
export class RedisNonceStore implements NonceStore {
  private readonly keyPrefix = "niov:session:nonce:";

  constructor(private readonly client: Redis) {}

  async set(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.client.set(
      this.keyPrefix + sessionId,
      "1",
      "EX",
      ttlSeconds,
    );
  }

  async has(sessionId: string): Promise<boolean> {
    const exists = await this.client.exists(this.keyPrefix + sessionId);
    return exists === 1;
  }

  async delete(sessionId: string): Promise<void> {
    await this.client.del(this.keyPrefix + sessionId);
  }
}

// WHAT: Construct the right NonceStore for the current environment.
// INPUT: None.
// OUTPUT: A NonceStore instance.
// WHY: Tests rarely have REDIS_URL set. Production always does. One
//      function chooses the right backing for the caller.
export function makeDefaultNonceStore(): NonceStore {
  const url = process.env.REDIS_URL;
  if (typeof url !== "string" || url.length === 0) {
    return new MemoryNonceStore();
  }
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  return new RedisNonceStore(client);
}
