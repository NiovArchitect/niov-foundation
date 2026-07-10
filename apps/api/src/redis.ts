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
  // [INBOUND-SIGNAL] Atomically claim a key ONCE: returns true if this call set
  // it (was absent), false if it already existed. Backed by Redis SET NX EX so a
  // concurrent replay/duplicate can never both win. Used for single-use nonce
  // (anti-replay) and per-resource debounce/dedupe of inbound signals.
  claimOnce(key: string, ttlSeconds: number): Promise<boolean>;
  // [INBOUND-SIGNAL] Increment a counter (creating it with the TTL on first
  // bump); returns the new count. Used for per-org, per-minute quota bounding so
  // a burst of signed events can't exhaust an org's downstream (Google) quota.
  incr(key: string, ttlSeconds: number): Promise<number>;
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

  // Synchronous check-then-set (single-threaded event loop ⇒ atomic here) so
  // tests exercise the same claim-once semantics as the Redis SET NX.
  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.entries.has(key)) return false;
    await this.set(key, ttlSeconds);
    return true;
  }

  private readonly counters = new Map<string, number>();
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    if (next === 1) {
      const handle = setTimeout(() => this.counters.delete(key), ttlSeconds * 1000);
      handle.unref?.();
    }
    return next;
  }
}

// WHAT: A NonceStore backed by a real ioredis client.
// INPUT: An ioredis Redis instance plus an optional key prefix so the
//        same Redis can host multiple kinds of presence-tokens
//        (session nonces, COSMP declarations, etc) without collision.
// OUTPUT: An object satisfying NonceStore.
// WHY: Production needs a shared store across processes. ioredis
//      handles reconnection, clustering, and pipelining for us.
export class RedisNonceStore implements NonceStore {
  private readonly keyPrefix: string;

  constructor(
    private readonly client: Redis,
    keyPrefix: string = "niov:session:nonce:",
  ) {
    this.keyPrefix = keyPrefix;
  }

  async set(key: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.keyPrefix + key, "1", "EX", ttlSeconds);
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(this.keyPrefix + key);
    return exists === 1;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.keyPrefix + key);
  }

  // Atomic set-if-absent with TTL: SET key "1" EX ttl NX → "OK" (claimed) | null
  // (already present). The entire inbound replay/dedupe defense rests on this
  // arg order + NX flag.
  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    const r = await this.client.set(this.keyPrefix + key, "1", "EX", ttlSeconds, "NX");
    return r === "OK";
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const n = await this.client.incr(this.keyPrefix + key);
    if (n === 1) await this.client.expire(this.keyPrefix + key, ttlSeconds);
    return n;
  }
}

// WHAT: Construct the right NonceStore for the current environment,
//        scoped to a particular key prefix.
// INPUT: An optional key prefix (defaults to the session-nonce one).
// OUTPUT: A NonceStore instance.
// WHY: Tests rarely have REDIS_URL set. Production always does. One
//      function chooses the right backing for the caller. Different
//      prefixes give us multiple isolated stores from one Redis.
export function makeDefaultNonceStore(
  keyPrefix: string = "niov:session:nonce:",
): NonceStore {
  const url = process.env.REDIS_URL;
  if (typeof url !== "string" || url.length === 0) {
    return new MemoryNonceStore();
  }
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  return new RedisNonceStore(client, keyPrefix);
}
