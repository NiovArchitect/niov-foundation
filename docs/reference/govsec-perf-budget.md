# GOVSEC.4 Gateway Performance Budget + Hot-Key Runbook (G4-D)

**Status:** G4-D-D1 (measure-first baseline). Companion to ADR-0049 and
`docs/reference/govsec-control-matrix.md` (GAP-O2 / GAP-O7). Landed test + docs
only — **no production optimization** (that is D2).

## 1. Purpose

Establish the gateway's per-request **operation budget** (the GAP-O2-relevant
quantity) and the **measurement method**, so that:
- regressions in per-request Redis/DB cost are caught deterministically in CI;
- D2 optimization has a baseline to improve against;
- G4-B2-B (the swarm counter) lands only after a measured budget exists.

## 2. Why CI p99 is NOT authoritative

CI has **no Redis service**, and the test environment uses the
`MemoryRateLimitStore` (`makeDefaultRateLimitStore` returns memory when
`NODE_ENV=test`). A CI latency benchmark would therefore measure the in-memory
store + runner noise — **not** the Redis `INCR`/`EXPIRE`/`TTL` round-trips or the
hot-key contention that GAP-O2 is about. **CI gates the deterministic op-count
contract** (`tests/integration/gateway-perf-budget.test.ts`); **real p99 is a
local/manual measurement** (§6). No CI timing/p99 assertions.

## 3. Current gateway operation budget (per request)

| Path | `store.hit` | `getMultiplier` | `setMultiplier` | DB read |
|---|---|---|---|---|
| `GET /api/v1/health` (exempt) | 0 | 0 | 0 | 0 |
| unauthenticated governed (e.g. `login`) | 1 | 1 | 0 | 0 |
| default-fallback unauthenticated (unmapped route) | 1 | 1 | 0 | 0 |
| authenticated governed | 1 | 1 | 0 | **1** (`getOrgSettingsOrDefaults`, STEP-1 ip_whitelist) |
| 429 first breach | 1 | 1 | 0 | logger always; `RATE_LIMITED` audit only when authenticated + first breach (G4-B1) — **not** a `RateLimitStore` call |

The op-count contract test pins the `store.*` columns. The authenticated DB read
is documented here (a D2 optimization target), not asserted via the store wrapper.

## 4. Current Redis round-trip baseline (`RedisRateLimitStore`)

**Pre-D2-A baseline.** `hit(key, ttl)` was **not pipelined**:
- `INCR key`
- `EXPIRE key ttl` (first hit only, when `count === 1`)
- `TTL key` (**every** hit)
→ **~2-3 round-trips per `hit`.**

**G4-D-D2-A (landed).** `hit` is now a **single atomic Lua `EVAL`** (`HIT_LUA`:
`INCR` + conditional first-hit `EXPIRE` + `TTL`, returning `{count, ttl}`) →
**1 round-trip** (down from ~2-3). The `TTL` is now inside the same EVAL, so it
is no longer a separate round-trip. Atomicity also removes a latent race: a crash
between the old separate `INCR` and the first-hit `EXPIRE` could orphan a no-TTL
key (a permanent block for that key); the EVAL makes INCR + first-hit EXPIRE + TTL
indivisible. `count` / `ttl_seconds` (same `> 0` fallback) / the 429 Retry-After
are unchanged. `getMultiplier` (D2-B) and the ip_whitelist DB read (D2-C) are
**unchanged at D2-A**.

`getMultiplier(key)` = `GET mult:key` → **~1 round-trip** (returns `1.0` when
absent — fires even when no multiplier is active).

`setMultiplier` = `SET … EX` (~1 round-trip; only on a Loop-5 anomaly, not the
hot path).

**Governed-request estimated Redis baseline ≈ 3-4 round-trips** (+ the
authenticated `getOrgSettingsOrDefaults` DB read). **Post-D2-A: `hit` = 1 →
≈ 2 Redis round-trips (1 `hit` EVAL + 1 `getMultiplier` GET) + the DB read.** A
future G4-B2-B swarm counter would add **another** `hit`-style counter on top —
which is exactly why it is gated on this budget.

## 5. D2 optimization targets

- ~~Pipeline / Lua `RedisRateLimitStore.hit`~~ **— LANDED at G4-D-D2-A** (single
  atomic `EVAL`: `INCR` + conditional `EXPIRE` + `TTL` in **one** round-trip; also
  closes the no-TTL orphan-key race). Verification = D3.
- ~~Avoid the unconditional `TTL` round-trip~~ **— subsumed by D2-A** (the `TTL`
  is now inside the single EVAL, not a separate round-trip).
- **D2-B (deferred):** evaluate skipping/caching `getMultiplier` `GET` **without**
  breaking the Loop-5 `read_content` backpressure path. Co-designed with
  G4-B2-B (the swarm counter), since both touch the multiplier key space.
- **D2-C (deferred → GOVSEC.7):** cache/defer the authenticated STEP-1
  `getOrgSettingsOrDefaults` ip_whitelist DB read **without** weakening STEP-1
  semantics (cache staleness / multi-instance / control-order risk).
- Keep the health path zero-store.

## 6. Local Redis p99 benchmark runbook (manual; NOT CI)

Measure against a **local** Redis (not CI). Synthetic routes/entities only.

1. Start a local Redis and run the API with `REDIS_URL` set (so
   `makeDefaultRateLimitStore` selects `RedisRateLimitStore`).
2. Drive load against representative scenarios with a synthetic load tool
   (e.g., a local `npx tsx` script or `autocannon`-style driver — **not** added
   to the repo in D1):
   - `GET /api/v1/health` (exempt)
   - `POST /api/v1/auth/login` (unauthenticated governed, ip-scoped)
   - an unmapped route → default fallback
   - an authenticated governed route (synthetic token + synthetic entity)
   - `read_content` (exercises the multiplier path)
   - a simulated hashed-IP-cluster counter scenario (only once B2-B planning begins)
3. Capture per scenario: requests/sec, avg latency, **p95**, **p99**, `store.hit`
   calls/request, `getMultiplier` calls/request, DB reads/request (where
   observable), **Redis command count/request**, and hot-key concentration
   (commands against the single busiest key).

**Thresholds are NOT finalized in D1.** D1 establishes the measurement method +
the current budget; D2/D3 set and verify targets.

## 7. G4-B2-B gating

The production swarm counter (G4-B2-B) **may not land until D2/D3 confirm the
budget**. **Operation-global swarm counters are rejected** (single Redis hot key
→ collapse). **Hashed-IP-cluster counters** (`HMAC(ip) % N` over the operation)
are the preferred design; the final cluster count `N` and thresholds are set
**after G4-D**, using the existing `RateLimitStore.hit` (synthetic keys) +
`setMultiplier`/`getMultiplier` backpressure path.

## 8. Privacy constraints (benchmark + artifacts)

No raw IP; no raw user-agent; no auth tokens; no request body / query / headers /
private content; synthetic entities only; no production secrets. Op-count
assertions carry no PII.
