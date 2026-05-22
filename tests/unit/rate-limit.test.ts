// FILE: rate-limit.test.ts (unit)
// PURPOSE: GOVSEC.4 G4-D-D2-A -- prove RedisRateLimitStore.hit issues ONE atomic
//          Lua EVAL (INCR + conditional first-hit EXPIRE + TTL) per hit, parses
//          [count, ttl] into {count, ttl_seconds} with the > 0 fallback, and does
//          NOT call incr/expire/ttl separately. Also locks that getMultiplier
//          (GET) and setMultiplier (SET EX) are unchanged by D2-A. No real Redis;
//          a hand-rolled fake ioredis client (no dependency). No timing/p99.
// CONNECTS TO: apps/api/src/rate-limit.ts RedisRateLimitStore.

import { describe, expect, it } from "vitest";
import { RedisRateLimitStore } from "@niov/api";

// Hand-rolled fake ioredis client: records eval/get/set calls and asserts that
// the per-hit path no longer uses incr/expire/ttl separately.
class FakeRedis {
  evalCalls: Array<{ script: string; numKeys: number; args: unknown[] }> = [];
  incrCalls = 0;
  expireCalls = 0;
  ttlCalls = 0;
  getCalls: string[] = [];
  setCalls: Array<{ key: string; value: string; rest: unknown[] }> = [];
  private evalReturn: [number, number] = [1, 60];
  private getReturn: string | null = null;

  setEvalReturn(count: number, ttl: number): void {
    this.evalReturn = [count, ttl];
  }
  setGetReturn(v: string | null): void {
    this.getReturn = v;
  }
  async eval(script: string, numKeys: number, ...args: unknown[]): Promise<[number, number]> {
    this.evalCalls.push({ script, numKeys, args });
    return this.evalReturn;
  }
  async incr(): Promise<number> {
    this.incrCalls += 1;
    return 1;
  }
  async expire(): Promise<number> {
    this.expireCalls += 1;
    return 1;
  }
  async ttl(): Promise<number> {
    this.ttlCalls += 1;
    return 60;
  }
  async get(key: string): Promise<string | null> {
    this.getCalls.push(key);
    return this.getReturn;
  }
  async set(key: string, value: string, ...rest: unknown[]): Promise<string> {
    this.setCalls.push({ key, value, rest });
    return "OK";
  }
}

function makeStore(): { store: RedisRateLimitStore; fake: FakeRedis } {
  const fake = new FakeRedis();
  const store = new RedisRateLimitStore(
    fake as unknown as ConstructorParameters<typeof RedisRateLimitStore>[0],
  );
  return { store, fake };
}

describe("GOVSEC.4 G4-D-D2-A RedisRateLimitStore.hit (atomic Lua EVAL)", () => {
  it("issues exactly one eval per hit and never calls incr/expire/ttl separately", async () => {
    const { store, fake } = makeStore();
    await store.hit("login:ip:10.0.0.1", 60);
    expect(fake.evalCalls.length).toBe(1);
    expect(fake.incrCalls).toBe(0);
    expect(fake.expireCalls).toBe(0);
    expect(fake.ttlCalls).toBe(0);
  });

  it("eval receives the script, KEYS=1, the prefixed key, and the ttl arg", async () => {
    const { store, fake } = makeStore();
    await store.hit("login:ip:10.0.0.1", 60);
    const call = fake.evalCalls[0]!;
    expect(call.numKeys).toBe(1);
    // default key prefix is "niov:rate:"
    expect(call.args[0]).toBe("niov:rate:login:ip:10.0.0.1");
    expect(call.args[1]).toBe("60");
  });

  it("the Lua script does INCR + conditional first-hit EXPIRE + TTL and returns both", async () => {
    const { store, fake } = makeStore();
    await store.hit("k", 30);
    const script = fake.evalCalls[0]!.script;
    expect(script).toContain("INCR");
    expect(script).toContain("EXPIRE");
    expect(script).toContain("TTL");
    expect(script).toContain("c == 1"); // EXPIRE is conditional on first hit
  });

  it("parses [count, ttl] into { count, ttl_seconds }", async () => {
    const { store, fake } = makeStore();
    fake.setEvalReturn(5, 42);
    const r = await store.hit("k", 60);
    expect(r.count).toBe(5);
    expect(r.ttl_seconds).toBe(42);
  });

  it("falls back to the configured ttlSeconds when the returned ttl is <= 0", async () => {
    const { store, fake } = makeStore();
    fake.setEvalReturn(3, -1);
    const r = await store.hit("k", 90);
    expect(r.count).toBe(3);
    expect(r.ttl_seconds).toBe(90);
  });

  it("propagates eval errors (no new fail-open / fail-closed / retry)", async () => {
    const { store, fake } = makeStore();
    fake.eval = async () => {
      throw new Error("redis down");
    };
    await expect(store.hit("k", 60)).rejects.toThrow("redis down");
  });

  it("getMultiplier is unchanged: a GET on the mult-prefixed key (no eval)", async () => {
    const { store, fake } = makeStore();
    fake.setGetReturn("0.5");
    const m = await store.getMultiplier("read_content:entity:abc");
    expect(m).toBe(0.5);
    expect(fake.getCalls).toContain("niov:rate:mult:read_content:entity:abc");
    expect(fake.evalCalls.length).toBe(0);
  });

  it("setMultiplier is unchanged: a SET ... EX on the mult-prefixed key (no eval)", async () => {
    const { store, fake } = makeStore();
    await store.setMultiplier("read_content:entity:abc", 0.5, 3600);
    expect(fake.setCalls.length).toBe(1);
    expect(fake.setCalls[0]!.key).toBe("niov:rate:mult:read_content:entity:abc");
    expect(fake.setCalls[0]!.value).toBe("0.5");
    expect(fake.setCalls[0]!.rest).toContain("EX");
    expect(fake.setCalls[0]!.rest).toContain(3600);
    expect(fake.evalCalls.length).toBe(0);
  });
});
