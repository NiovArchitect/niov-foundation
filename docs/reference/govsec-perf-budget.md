# GOVSEC.4 Gateway Performance Budget + Hot-Key Runbook (G4-D)

**Status:** G4-D-D3 (post-optimization verification). D1 = measure-first baseline;
D2-A = `RedisRateLimitStore.hit` Lua optimization (landed at
`b6fe3b0aa84ac2630da0614041fcdfef344c7c51`, CI run `26265354599` green); D3 =
verification + status recording (docs-only; see §9). Companion to ADR-0049 and
`docs/reference/govsec-control-matrix.md` (GAP-O2 / GAP-O7).

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
  closes the no-TTL orphan-key race). Verification = **D3 (complete; see §9)**.
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
budget**. **G4-D-D3 has now confirmed the post-optimization budget (see §9), so
G4-B2-B is unblocked — but it is NOT implemented here** (G4-B2-B remains a
separate future phase). **Operation-global swarm counters are rejected** (single
Redis hot key → collapse). **Hashed-IP-cluster counters** (`HMAC(ip) % N` over
the operation) are the preferred design; the final cluster count `N` and
thresholds are set **after G4-D**, using the existing `RateLimitStore.hit`
(synthetic keys) + `setMultiplier`/`getMultiplier` backpressure path.

## 8. Privacy constraints (benchmark + artifacts)

No raw IP; no raw user-agent; no auth tokens; no request body / query / headers /
private content; synthetic entities only; no production secrets. Op-count
assertions carry no PII.

## 9. G4-D-D3 post-optimization verification (2026-05-21)

**G4-D-D3 verifies the D2-A Redis hit optimization and op-count budget, records GAP-O2 as optimization-verified under the documented local/manual p99 posture, keeps GAP-O7 open, and unblocks G4-B2-B without implementing it.**

This is a **docs-only** phase: production behavior is already verified by the
existing tests and CI, no new code is needed, no new test artifact is needed, and
D3's only remaining work is status/closure recording.

**Optimization landed.** G4-D-D2-A landed at commit
`b6fe3b0aa84ac2630da0614041fcdfef344c7c51`; CI run `26265354599` passed all four
jobs (Typecheck, Unit, Integration, Elixir).

**D2-A verification evidence (re-confirmed at D3):**
- `apps/api/src/rate-limit.ts` defines `HIT_LUA`; the script performs `INCR` +
  conditional `EXPIRE` when `count == 1` + `TTL`.
- `RedisRateLimitStore.hit` issues **one** `this.client.eval` call; the
  `ttl_seconds` fallback remains `ttl > 0 ? ttl : ttlSeconds`; existing error
  propagation is preserved; **no** separate `client.incr` / `client.expire` /
  `client.ttl` hot-path calls remain.
- `tests/unit/rate-limit.test.ts` verifies the EVAL semantics + fallback.
- `tests/integration/gateway-perf-budget.test.ts` verifies the gateway op-count
  budget stays green: the gateway still calls `hit` once per governed request;
  the governed budget remains **1 `hit` + 1 `getMultiplier` + 0 `setMultiplier`**;
  the 429 path adds no extra store calls. `gateway-swarm` remains green; full
  integration was green; full CI was green.
- The no-TTL orphan-key race is fixed because INCR + first-hit EXPIRE + TTL are
  indivisible inside the atomic Lua EVAL.

**GAP-O2 (conservative D3 wording):** optimization verified; op-count budget
verified; G4-B2-B unblocked. **Redis p99 / wall-clock burst behavior remains
governed by the documented local/manual runbook (§6) and is NOT asserted as
CI-closed.** No CI p99/timing assertions are added.

**GAP-O7 remains open** — working-set route p99 under adversarial volume is **not**
solved and **not** closed by D3.

**Deferrals preserved:** D2-B (`getMultiplier` optimization) remains deferred and
co-designed with G4-B2-B; D2-C (ip_whitelist / `getOrgSettingsOrDefaults` DB read)
remains deferred to GOVSEC.7; G4-C (privileged-route throttle) remains separate,
tied to GOVSEC.5 coordination; GOVSEC.5 and GOVSEC.7 untouched. No production swarm
counter, `swarm:op` keys, gateway `setMultiplier` call, multiplier/backpressure
change, or ip_whitelist change is made here.
