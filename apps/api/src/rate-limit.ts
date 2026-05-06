// FILE: rate-limit.ts
// PURPOSE: Abstraction for the API gateway's per-window counter
//          store. Memory implementation for tests; Redis implementation
//          for production via ioredis INCR + EXPIRE.
// CONNECTS TO: gateway.middleware.ts (the only consumer).

import Redis from "ioredis";

// WHAT: The result of one rate-limit hit.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Carries both the new count (so the caller can compare to a
//      limit) and the remaining TTL (so the 429 response can
//      include retry_after_seconds).
export interface RateLimitHit {
  count: number;
  ttl_seconds: number;
}

// WHAT: The contract every rate-limit store implementation honors.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: hit() is the per-request counter. setMultiplier (Section 10
//      Loop 5) lets the anomaly detector temporarily reduce the
//      effective limit on a key for ttlSeconds. multiplier=0.5 means
//      "halve the user's normal allowance for the next ttl"; the
//      threshold check inside hit() compares count against
//      perMinute * multiplier instead of perMinute. multiplier
//      defaults to 1.0 when no entry exists.
export interface RateLimitStore {
  hit(key: string, ttlSeconds: number): Promise<RateLimitHit>;
  setMultiplier(
    key: string,
    multiplier: number,
    ttlSeconds: number,
  ): Promise<void>;
  getMultiplier(key: string): Promise<number>;
  reset(): Promise<void>;
}

// WHAT: An in-memory RateLimitStore for tests + REDIS_URL-less envs.
// INPUT: None at construction.
// OUTPUT: A RateLimitStore instance.
// WHY: Tests need deterministic counter state without a network
//      dependency. The TTL is honored via the stored expiresAt
//      timestamp -- counters auto-reset when expired.
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private readonly multipliers = new Map<
    string,
    { multiplier: number; expiresAt: number }
  >();

  async hit(key: string, ttlSeconds: number): Promise<RateLimitHit> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing === undefined || existing.expiresAt <= now) {
      this.entries.set(key, {
        count: 1,
        expiresAt: now + ttlSeconds * 1000,
      });
      return { count: 1, ttl_seconds: ttlSeconds };
    }
    existing.count++;
    return {
      count: existing.count,
      ttl_seconds: Math.max(
        0,
        Math.ceil((existing.expiresAt - now) / 1000),
      ),
    };
  }

  async setMultiplier(
    key: string,
    multiplier: number,
    ttlSeconds: number,
  ): Promise<void> {
    this.multipliers.set(key, {
      multiplier,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async getMultiplier(key: string): Promise<number> {
    const entry = this.multipliers.get(key);
    if (entry === undefined) return 1.0;
    if (entry.expiresAt <= Date.now()) {
      this.multipliers.delete(key);
      return 1.0;
    }
    return entry.multiplier;
  }

  // WHAT: Clear all rate-limit state (entries + multipliers).
  // INPUT: None.
  // OUTPUT: A promise that resolves immediately (in-memory clear
  //          is synchronous; async signature satisfies the
  //          RateLimitStore interface contract uniformly with
  //          RedisRateLimitStore).
  // WHY: Test infrastructure use ONLY. Production code does not
  //      invoke this method. Tests that exercise rate-limit-
  //      protected endpoints repeatedly within one file's
  //      lifetime call this between cases (via the
  //      resetRateLimits / withCleanRateLimits helpers in
  //      tests/helpers.ts) to reset state. Tests that explicitly
  //      assert on rate-limit BEHAVIOR (e.g.,
  //      tests/integration/gateway.test.ts:349) must NOT call
  //      this; they should set up rate-limit state
  //      deterministically.
  //
  //      Per Drift G4-G: containerized Postgres runs ~37×
  //      faster than real Supabase, so rapid-fire test logins
  //      now collide with the auth rate limiter that real-
  //      Supabase latency naturally avoided. This method
  //      enables clean isolation.
  async reset(): Promise<void> {
    this.entries.clear();
    this.multipliers.clear();
  }
}

// WHAT: A RateLimitStore backed by a real ioredis client.
// INPUT: An ioredis client + an optional key prefix.
// OUTPUT: A RateLimitStore instance.
// WHY: Production needs a shared counter across processes. INCR
//      followed by EXPIRE on the first hit gives an atomic-enough
//      fixed-window counter for our needs.
export class RedisRateLimitStore implements RateLimitStore {
  private readonly keyPrefix: string;
  private readonly multPrefix: string;

  constructor(
    private readonly client: Redis,
    keyPrefix: string = "niov:rate:",
  ) {
    this.keyPrefix = keyPrefix;
    this.multPrefix = `${keyPrefix}mult:`;
  }

  async hit(key: string, ttlSeconds: number): Promise<RateLimitHit> {
    const k = this.keyPrefix + key;
    const count = await this.client.incr(k);
    if (count === 1) {
      await this.client.expire(k, ttlSeconds);
    }
    const ttl = await this.client.ttl(k);
    return {
      count,
      ttl_seconds: ttl > 0 ? ttl : ttlSeconds,
    };
  }

  async setMultiplier(
    key: string,
    multiplier: number,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      this.multPrefix + key,
      String(multiplier),
      "EX",
      ttlSeconds,
    );
  }

  async getMultiplier(key: string): Promise<number> {
    const raw = await this.client.get(this.multPrefix + key);
    if (raw === null) return 1.0;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 1.0;
  }

  // WHAT: Clear all rate-limit state under this store's key
  //        prefixes (both rate-limit counters and multipliers).
  // INPUT: None.
  // OUTPUT: A promise that resolves once the SCAN+DEL sweep
  //          completes.
  // WHY: Same rationale as MemoryRateLimitStore.reset --
  //      uniform RateLimitStore interface compliance for test
  //      infrastructure. Production code does not invoke this.
  //
  //      Implementation uses SCAN with MATCH on each prefix
  //      (rather than FLUSHDB) to avoid touching unrelated
  //      keys if the Redis instance is shared with other
  //      Foundation subsystems. SCAN is non-blocking; tests
  //      using a Redis-backed store (none today; future-proof)
  //      get clean isolation without disrupting any other keys
  //      in the same database.
  async reset(): Promise<void> {
    for (const prefix of [this.keyPrefix, this.multPrefix]) {
      const pattern = `${prefix}*`;
      let cursor = "0";
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = next;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== "0");
    }
  }
}

// WHAT: Build the right RateLimitStore for the current environment.
// INPUT: None.
// OUTPUT: A RateLimitStore instance.
// WHY: Production reads REDIS_URL; tests use the memory store.
//      Testing against shared-tier Redis would couple our suite
//      to network conditions for a counter that has zero business
//      logic in it. NODE_ENV=test always picks memory.
export function makeDefaultRateLimitStore(): RateLimitStore {
  if (process.env.NODE_ENV === "test") {
    return new MemoryRateLimitStore();
  }
  const url = process.env.REDIS_URL;
  if (typeof url !== "string" || url.length === 0) {
    return new MemoryRateLimitStore();
  }
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  return new RedisRateLimitStore(client);
}
