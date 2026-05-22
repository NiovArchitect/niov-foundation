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
| unauthenticated governed (e.g. `login`), passes per-key | **2** | 1 | 0 | 0 |
| default-fallback unauthenticated (unmapped route), passes per-key | **2** | 1 | 0 | 0 |
| authenticated governed, passes per-key | **2** | 1 | 0 | **1** (`getOrgSettingsOrDefaults`, STEP-1 ip_whitelist) |
| per-key 429 (breaches the per-key limit) | 1 | 1 | 0 | logger always; `RATE_LIMITED` audit only when authenticated + first breach (G4-B1) — **not** a `RateLimitStore` call |
| swarm 429 (passes per-key, breaches the cluster threshold) | 2 | 1 | 0 | logger only (no chain audit; no `SWARM_DETECTED` literal) |

**GOVSEC.4 G4-B2-B updated the budget.** A governed request that passes the per-key
limit now incurs a **second `store.hit`** — the aggregate **swarm cluster counter**
(`swarm:<op>:cluster:<bucket>`). So the per-request budget is **2 `hit` + 1
`getMultiplier` + 0 `setMultiplier`** (down-path: a **per-key 429 short-circuits
before** the swarm counter, costing only 1 `hit`; a **swarm 429** costs 2 `hit`).
`getMultiplier` is unchanged at 1 — the swarm path adds **no** second
`getMultiplier` and calls **no** `setMultiplier` (Fork α direct cluster shed;
`getMultiplier` optimization remains D2-B, deferred). This 2-`hit` budget is the
**budgeted swarm-counter cost**, not a regression — it is exactly the per-request
op that G4-D measured (D1) and optimized (`hit` → 1 atomic round-trip, D2-A) before
the counter was allowed to land.

The op-count contract test pins the `store.*` columns. The authenticated DB read
is documented here (a D2-C optimization target, deferred to GOVSEC.7), not asserted
via the store wrapper.

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
≈ 2 Redis round-trips (1 `hit` EVAL + 1 `getMultiplier` GET) + the DB read.**
**Post-G4-B2-B (Fork α): a governed request that passes the per-key limit adds the
swarm cluster `hit` → 2 `hit` EVAL + 1 `getMultiplier` GET ≈ 3 Redis round-trips +
the DB read.** This is the swarm counter the budget was gated on: it is allowed to
land precisely because G4-D first measured (D1) and optimized (`hit` → 1 atomic
round-trip, D2-A) the per-request op so the second `hit` is a single atomic EVAL,
not a 2-3 round-trip operation.

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

The production swarm counter **landed at G4-B2-B (Fork α — direct cluster shed)**
after D3 confirmed the post-optimization budget (see §9, §10). **Operation-global
swarm counters are rejected** (single Redis hot key → collapse). The implemented
design uses a **hashed-IP-cluster counter** keyed `swarm:<op>:cluster:<bucket>`
where `bucket = HMAC-SHA256(ip, jwtSecret) % N`, `N = 64` (overridable per build),
via the **existing `RateLimitStore.hit`** fixed-window (60s) — **no** interface
change, **no** `setMultiplier`, **no** second `getMultiplier`. On a cluster breach
the gateway returns 429 directly (Retry-After from the cluster `hit` TTL). Final
production thresholds are tuned via the local Redis runbook (§6); CI cannot measure
real p99 (no Redis), so tests inject low thresholds + `N=1` to prove shedding
deterministically. **Multiplier-backpressure generalization (Fork β) was NOT
chosen** — it would add a second `getMultiplier` and couple to D2-B; that path
remains future work co-designed with D2-B.

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

## 10. G4-B2-B production swarm counter (2026-05-21)

**G4-B2-B (Fork α — direct cluster shed) closes the GAP-B2 residual: a
distributed-under-limit swarm (many sources, each within its own per-key limit) is
now shed by an aggregate cluster counter, while the per-key limit stays the primary
control.**

- **Key shape:** `swarm:<op>:cluster:<bucket>`, `bucket = HMAC-SHA256(ip,
  jwtSecret) % N`, `N = 64` (the same JWT-keyed HMAC used for the G4-B1 `ip_hash`).
  **No raw IP / user-agent / body / token / entity ID / PII** in the key. Bounded
  cardinality ≈ (operations × 64) keys per 60s window — no operation-global hot key.
- **Mechanism:** the gateway calls the **existing `store.hit(swarmKey, 60)`** (same
  D2-A atomic Lua EVAL fixed-window) only for requests that **passed** the per-key
  check; if the cluster count exceeds a per-op threshold it returns 429
  (Retry-After from the cluster `hit` TTL). **No `setMultiplier`, no second
  `getMultiplier`** (Fork α; D2-B stays deferred). `RedisRateLimitStore` /
  `RateLimitStore` interface / `HIT_LUA` / `MemoryRateLimitStore` are unchanged.
- **Thresholds:** conservative per-op defaults in `gateway.middleware.ts`
  (`SWARM_DEFAULT_LIMITS`, `SWARM_DEFAULT_FALLBACK`), overridable per build
  (`buildApp({ swarmThresholdOverrides, swarmClusterCount })`) for deterministic
  tests. No DB read, no org settings, no `getOrgSettingsOrDefaults`, no schema.
- **Failure:** the swarm `hit` error propagates exactly like the per-key `hit` (no
  new fail-open / fail-closed / retry).
- **Audit/logging:** swarm denials are **logger-only** (privacy-safe, hashed IP);
  **no `SWARM_DETECTED` literal**, **no ADR-0002 amendment**; the G4-B1 first-breach
  chain audit is unchanged.
- **Op-count:** governed (passes per-key) now **2 `hit` + 1 `getMultiplier` + 0
  `setMultiplier`** (§3). The budgeted swarm-counter cost, gated on G4-D.
- **GAP-O7 remains open** — working-set route p99 is unaffected and not closed.
  **No CI p99/timing assertions** added; real p99 stays the local runbook (§6).

## 11. G4-D-D2-B getMultiplier optimization — docs-only no-op (2026-05-21)

**G4-D-D2-B is a docs-only no-op / status-recording phase: `getMultiplier` has no
safe further optimization at this phase, so no code or tests change. Fork B (no-op)
is chosen; Fork A (producer-scoped skipping) is rejected by default.**

- **`getMultiplier` is already one minimal Redis `GET` / O(1)** — there is no
  inefficiency in the operation itself to optimize. There is exactly **one
  production call site** (`apps/api/src/middleware/gateway.middleware.ts`
  `store.getMultiplier(key)` on the per-key key), and **G4-B2-B added no second
  `getMultiplier` call** (the swarm path uses `store.hit` only).
- **The only production `setMultiplier` producer remains Loop-5**
  (`apps/api/src/services/feedback/feedback.service.ts`):
  `setMultiplier("read_content:entity:<id>", 0.5, 3600)`. So a multiplier is only
  ever written for the `read_content` operation; the gateway calls `getMultiplier`
  for all governed keys, but only `read_content` has a current producer. The
  `setMultiplier` TTL (3600s) and behavior are unchanged.
- **Caching rejected** — it would create stale-multiplier behavior: delayed
  observation of a Loop-5 throttle, a stale `1.0` while a multiplier should apply,
  or a stale throttle after the Redis key expires. All three weaken a security
  control.
- **Producer-scoped skipping (Fork A) rejected by default** — calling
  `getMultiplier` only for `read_content` would couple the gateway to the exact set
  of `setMultiplier` producers; a future producer added for another operation
  without updating gateway eligibility would **silently bypass backpressure** — an
  unacceptable silent-control-failure footgun for a government-grade layer.
- **Combined `hit`+multiplier EVAL rejected** — reading both in one round-trip would
  require changing `HIT_LUA` / `RedisRateLimitStore.hit` / the `RateLimitStore`
  interface, all outside D2-B's safe scope.
- **No code change, no tests added.** The governed **op-count budget is unchanged**
  (passing per-key = 2 `hit` + 1 `getMultiplier` + 0 `setMultiplier`; per-key 429 =
  1 `hit`; swarm 429 = 2 `hit`) and the **Redis round-trip budget is unchanged**.
- **The next real performance lever is D2-C (the authenticated STEP-1 ip_whitelist
  `getOrgSettingsOrDefaults` DB read), deferred to GOVSEC.7.** GAP-O2 remains
  optimization-verified under the documented local/manual p99 posture; **GAP-O7
  remains open**; no CI p99/timing assertions. G4-C remains separate (tied to
  GOVSEC.5); GOVSEC.5 / GOVSEC.7 untouched.
