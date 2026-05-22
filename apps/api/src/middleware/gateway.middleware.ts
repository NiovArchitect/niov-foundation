// FILE: gateway.middleware.ts
// PURPOSE: One Fastify onRequest hook that enforces per-operation
//          rate limits using a RateLimitStore. Login is IP-scoped;
//          everything else is entity-scoped (extracted from the
//          JWT without a DB call).
// CONNECTS TO: rate-limit.ts (the store), every route the gateway
//              gates by URL pattern.

import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { writeAuditEvent } from "@niov/database";
import type { RateLimitStore } from "../rate-limit.js";
import { getOrgSettingsOrDefaults } from "../services/governance/org.js";

// WHAT: One per-operation policy.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Spec specifies a request-per-minute cap and a scope (the
//      grouping key) for each operation type.
export interface RateLimitPolicy {
  perMinute: number;
  scope: "entity" | "ip";
}

// WHAT: The default per-operation limits per spec.
// INPUT: Used as a constant.
// OUTPUT: None.
// WHY: Centralized so tests + production read the same source of
//      truth. Tests override individual entries via
//      buildApp({ rateLimitOverrides: { ... } }).
export const DEFAULT_LIMITS: Record<string, RateLimitPolicy> = {
  login: { perMinute: 10, scope: "ip" },
  // GOVSEC.4 G4-A / GAP-B1: govern the previously-unthrottled auth-sensitive
  // endpoints. refresh is authenticated -> entity-scoped, conservative (a client
  // should not rotate tokens dozens of times a minute). admin-reset is a
  // high-risk trigger path (ADR-0049 GOVSEC.3B/3D-C notes record it as a stub)
  // -> very restrictive.
  refresh: { perMinute: 20, scope: "entity" },
  admin_reset: { perMinute: 5, scope: "entity" },
  // GOVSEC.5 G4-C / GAP-B4: the 4 dual-control PRIVILEGED_ENDPOINTS routes
  // (platform monetization-config, platform org-creation, regulator access
  // grant/revoke -- see apps/api/src/security/privileged-endpoints.ts). These were
  // governed only by the generous `default` fallback (300/min) after G4-A; G4-C
  // gives them a strict privileged limit matching the admin_reset posture. The
  // dual-control (two-person) authorization is unchanged -- this is the
  // pre-auth gateway throttle layer only.
  privileged: { perMinute: 5, scope: "entity" },
  negotiate: { perMinute: 100, scope: "entity" },
  read_metadata: { perMinute: 200, scope: "entity" },
  read_content: { perMinute: 50, scope: "entity" },
  write: { perMinute: 30, scope: "entity" },
  share: { perMinute: 20, scope: "entity" },
  audit_query: { perMinute: 10, scope: "entity" },
  // GOVSEC.4 G4-A / GAP-B1: the fallback policy applied to any route
  // detectOperation does not map (and any mapped op missing an explicit policy)
  // so no route passes through the gateway ungoverned. Generous enough not to
  // break normal single-entity use, but bounds adversarial volume. Overridable
  // in tests via buildApp({ rateLimitOverrides: { default: { ... } } }).
  default: { perMinute: 300, scope: "entity" },
};

// WHAT: The fallback policy for unmapped routes when no "default" entry is
//        present in the limits map.
// INPUT: Used as a constant.
// OUTPUT: None.
// WHY: GOVSEC.4 G4-A / GAP-B1 -- a hard floor so unmapped routes are always
//      governed even if DEFAULT_LIMITS.default were ever removed.
export const DEFAULT_FALLBACK: RateLimitPolicy = { perMinute: 300, scope: "entity" };

// WHAT: Number of HMAC-derived IP clusters per operation for the swarm counter.
// INPUT: Used as a constant (overridable per build for deterministic tests).
// OUTPUT: None.
// WHY: GOVSEC.4 G4-B2-B (GAP-B2). The aggregate swarm counter buckets each source
//      IP into one of N clusters via an HMAC (never the raw IP) so its cardinality
//      stays bounded (~operations × N keys per 60s window) and no single
//      operation-global Redis hot key forms (that hot-key class is GAP-O2).
export const SWARM_CLUSTER_COUNT = 64;

// WHAT: Conservative per-operation swarm cluster thresholds (cluster count per 60s
//        window) for the G4-B2-B aggregate counter.
// INPUT: Used as a constant (overridable per build / per test).
// OUTPUT: None.
// WHY: GOVSEC.4 G4-B2-B (GAP-B2, Fork α direct cluster shed). One cluster
//      aggregates ~1/N of the source-IP space for an operation; the threshold sits
//      generously above normal distributed traffic so it sheds only a coordinated
//      swarm (many sources each within their own per-key limit), not legitimate
//      load. Final tuning uses the local Redis runbook
//      (docs/reference/govsec-perf-budget.md §6); CI cannot measure real p99
//      (no Redis), so tests inject low thresholds to prove behavior deterministically.
export const SWARM_DEFAULT_LIMITS: Record<string, number> = {
  login: 200,
  refresh: 400,
  admin_reset: 100,
  negotiate: 2000,
  read_metadata: 4000,
  read_content: 1000,
  write: 600,
  share: 400,
  audit_query: 200,
  default: 6000,
};

// WHAT: Fallback swarm cluster threshold for any op missing an explicit entry.
// INPUT: Used as a constant.
// OUTPUT: None.
// WHY: GOVSEC.4 G4-B2-B -- a hard ceiling so every governed op has a swarm bound.
export const SWARM_DEFAULT_FALLBACK = 6000;

// WHAT: One pattern that matches a request to an operation type.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: One table beats nine if-statements; easier to extend.
interface OperationRule {
  method: string;
  pattern: RegExp;
  operation: string;
}

// WHAT: The complete URL-pattern table for the gateway.
// INPUT: Used as a constant.
// OUTPUT: None.
// WHY: Keeps the rate-limit topology in one place.
const OPERATION_RULES: OperationRule[] = [
  { method: "POST", pattern: /^\/api\/v1\/auth\/login$/, operation: "login" },
  // GOVSEC.4 G4-A / GAP-B1: previously-unmapped auth-sensitive endpoints.
  { method: "POST", pattern: /^\/api\/v1\/auth\/refresh$/, operation: "refresh" },
  {
    method: "POST",
    pattern: /^\/api\/v1\/auth\/admin-reset$/,
    operation: "admin_reset",
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/cosmp\/negotiate$/,
    operation: "negotiate",
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/cosmp\/capsule\/[^/]+\/metadata$/,
    operation: "read_metadata",
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/cosmp\/capsule\/[^/]+\/content$/,
    operation: "read_content",
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/cosmp\/capsule$/,
    operation: "write",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/cosmp\/capsule\/[^/]+$/,
    operation: "write",
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/cosmp\/share$/,
    operation: "share",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/cosmp\/share\/[^/]+$/,
    operation: "share",
  },
  // GOVSEC.5 G4-C / GAP-B4: the 4 dual-control PRIVILEGED_ENDPOINTS routes
  // (apps/api/src/security/privileged-endpoints.ts). Method-exact, mirroring the
  // registry, so a different method on the same path is NOT classified privileged.
  // These map to the strict `privileged` policy (5/min) instead of the generous
  // `default` fallback (300/min). Dual-control verification (requireDualControl) is
  // unchanged -- this is gateway throttle classification only.
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/platform\/monetization\/config$/,
    operation: "privileged",
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/platform\/orgs$/,
    operation: "privileged",
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/regulator\/access-grants$/,
    operation: "privileged",
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/regulator\/access-revocations$/,
    operation: "privileged",
  },
];

// WHAT: Pull the operation type out of an incoming request.
// INPUT: HTTP method and URL path.
// OUTPUT: The matched operation string, or null when no rule fires.
// WHY: One place to detect; routes outside the rule list pass
//      through untouched.
export function detectOperation(method: string, url: string): string | null {
  // Strip query string before matching.
  const path = url.split("?")[0] ?? url;
  for (const rule of OPERATION_RULES) {
    if (rule.method === method && rule.pattern.test(path)) {
      return rule.operation;
    }
  }
  return null;
}

// WHAT: The narrow list of routes exempt from rate limiting entirely.
// INPUT: Used as a constant.
// OUTPUT: None.
// WHY: GOVSEC.4 G4-A / GAP-B1 -- the default fallback governs every unmapped
//      route, but deploy/CI/platform health probes are high-frequency by design
//      and must never be throttled (a throttled probe would self-DoS the
//      deployment). Kept deliberately narrow: only the health endpoint.
const EXEMPT_RULES: OperationRule[] = [
  { method: "GET", pattern: /^\/api\/v1\/health$/, operation: "health" },
];

// WHAT: Whether a request path is exempt from rate limiting.
// INPUT: HTTP method and the query-stripped path.
// OUTPUT: true when the request matches an EXEMPT_RULES entry.
// WHY: GOVSEC.4 G4-A / GAP-B1 -- keep health/readiness probes unthrottled.
export function isExemptPath(method: string, path: string): boolean {
  for (const rule of EXEMPT_RULES) {
    if (rule.method === method && rule.pattern.test(path)) return true;
  }
  return false;
}

// WHAT: Try to recover the entity_id from a Bearer token without a
//        DB call.
// INPUT: The Authorization header value and the JWT secret.
// OUTPUT: The entity_id when the token verifies, null otherwise.
// WHY: Rate limiting must be cheap. A signed JWT verify is HMAC
//      only -- no DB round-trip.
function entityFromBearer(
  authHeader: string | string[] | undefined,
  jwtSecret: string,
): string | null {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.length === 0) return null;
  try {
    const payload = jwt.verify(token, jwtSecret) as { entity_id?: string };
    if (typeof payload.entity_id === "string") return payload.entity_id;
    return null;
  } catch {
    return null;
  }
}

// WHAT: The factory that builds the gateway hook with injected
//        config.
// INPUT: The RateLimitStore, the per-operation limits, the JWT
//        secret (for entity extraction).
// OUTPUT: A Fastify onRequest hook function.
// WHY: Constructor-injection-style hook -- tests can swap a
//      MemoryRateLimitStore + low limits to verify the 429 path.
export function makeGatewayHook(args: {
  store: RateLimitStore;
  limits: Record<string, RateLimitPolicy>;
  jwtSecret: string;
  // GOVSEC.4 G4-B2-B: optional per-operation swarm cluster thresholds and cluster
  // count N. Merged over SWARM_DEFAULT_LIMITS / SWARM_CLUSTER_COUNT; tests inject
  // low thresholds + small N to prove distributed-swarm shedding deterministically.
  swarmThresholds?: Partial<Record<string, number>>;
  swarmClusterCount?: number;
}) {
  const { store, limits, jwtSecret } = args;
  const windowSeconds = 60;
  const swarmLimits = { ...SWARM_DEFAULT_LIMITS, ...(args.swarmThresholds ?? {}) };
  const clusterCount = args.swarmClusterCount ?? SWARM_CLUSTER_COUNT;

  return async function gatewayHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const operation = detectOperation(request.method, request.url);

    // STEP 1 -- IP whitelist enforcement (Section 9).
    // Fires for every authenticated request EXCEPT login. Login
    // pre-dates the bearer token, and looking up email->entity->org
    // before authentication would create an enumeration oracle that
    // violates the Section 2A identical-error-for-unknown-email
    // guarantee. The malicious authenticator from a non-whitelisted
    // IP gets a session token but immediately gets 403 on every
    // subsequent authenticated request.
    if (operation !== "login") {
      const entityId = entityFromBearer(
        request.headers.authorization,
        jwtSecret,
      );
      if (entityId !== null) {
        const settings = await getOrgSettingsOrDefaults(entityId);
        if (settings.ip_whitelist.length > 0) {
          const ip = request.ip ?? "unknown";
          // TODO: support CIDR matching. Exact-string match for MVP.
          if (!settings.ip_whitelist.includes(ip)) {
            await reply.code(403).send({
              ok: false,
              error: "IP_NOT_WHITELISTED",
              message: "Source IP not in the org's allowed list",
            });
            return;
          }
        }
      }
    }

    // STEP 2 -- rate limiting.
    // GOVSEC.4 G4-A / GAP-B1: health/readiness probes are exempt so deploy/CI/
    // platform health checks are never throttled (a throttled probe self-DoSes
    // the deployment).
    const path = request.url.split("?")[0] ?? request.url;
    if (isExemptPath(request.method, path)) return;

    // GOVSEC.4 G4-A / GAP-B1: unmapped routes (detectOperation === null) and any
    // mapped op missing an explicit policy no longer pass through ungoverned --
    // they fall back to the "default" policy (overridable in tests) / the
    // DEFAULT_FALLBACK floor. The bucket key uses the operation name when mapped,
    // else a shared "default" bucket.
    const opKey = operation ?? "default";
    const policy = limits[opKey] ?? limits.default ?? DEFAULT_FALLBACK;

    let key: string;
    if (policy.scope === "ip") {
      key = `${opKey}:ip:${request.ip ?? "unknown"}`;
    } else {
      const entityId = entityFromBearer(
        request.headers.authorization,
        jwtSecret,
      );
      if (entityId === null) {
        // No verifiable token -- fall back to IP-keyed bucket so
        // unauthenticated callers cannot share an entity bucket.
        key = `${opKey}:ip:${request.ip ?? "unknown"}`;
      } else {
        key = `${opKey}:entity:${entityId}`;
      }
    }

    const result = await store.hit(key, windowSeconds);
    // Section 10 Loop 5 may have temporarily reduced this key's
    // effective allowance via setMultiplier (e.g., 0.5 for 1h after
    // an anomaly fires). Apply it to the threshold check; default
    // multiplier is 1.0 when no Loop 5 entry is active.
    const multiplier = await store.getMultiplier(key);
    const effectiveLimit = policy.perMinute * multiplier;
    if (result.count > effectiveLimit) {
      // GOVSEC.4 G4-B1 / GAP-B1+B4 evidence: rate-limit-denial audit, bounded.
      // First breach in this window only (the previous count was within the
      // limit, this one exceeded) -- avoids per-429 spam. Robust for fractional
      // multipliers (Loop-5 backpressure can make effectiveLimit non-integer).
      const firstBreach =
        result.count > effectiveLimit && result.count - 1 <= effectiveLimit;
      // Token-derived entity (cheap HMAC verify; null when unauthenticated).
      const auditEntityId = entityFromBearer(
        request.headers.authorization,
        jwtSecret,
      );
      // Hashed IP for correlatable-but-not-reversible evidence (never raw IP).
      const ipHash = createHmac("sha256", jwtSecret)
        .update(request.ip ?? "unknown")
        .digest("hex");
      // Structured logger (Pino) for ALL denials -- cheap, contention-free
      // operational evidence. Safe/minimized fields only; never raw IP/UA/body.
      request.log.warn(
        {
          event: "rate_limited",
          operation: opKey,
          scope: policy.scope,
          limit: effectiveLimit,
          count: result.count,
          ip_hash: ipHash,
          entity_id: auditEntityId,
          first_breach: firstBreach,
        },
        "gateway rate limit exceeded",
      );
      // Chain audit ONLY for authenticated first breaches: a per-entity chain is
      // bounded, whereas an unauthenticated null-actor event would fall to the
      // shared SYSTEM_CHAIN_KEY and risk pg_advisory_xact_lock contention under
      // swarm (GAP-O1). Authenticated-only + first-breach keeps the chain clean.
      if (firstBreach && auditEntityId !== null) {
        await writeAuditEvent({
          event_type: "RATE_LIMITED",
          outcome: "DENIED",
          actor_entity_id: auditEntityId,
          details: {
            reason: "rate_limited",
            operation: opKey,
            scope: policy.scope,
            limit: effectiveLimit,
            count: result.count,
            retry_after_seconds: result.ttl_seconds,
          },
        });
      }
      await reply
        .code(429)
        .header("Retry-After", String(result.ttl_seconds))
        .send({
          ok: false,
          error: "RATE_LIMIT_EXCEEDED",
          retry_after_seconds: result.ttl_seconds,
        });
      return;
    }

    // GOVSEC.4 G4-B2-B (Fork α, GAP-B2): aggregate swarm cluster counter. The
    // per-key limit above is the PRIMARY control; this is additive
    // defense-in-depth against a distributed-under-limit swarm (many sources, each
    // within its own per-key limit). The source IP is bucketed into one of N
    // clusters via an HMAC (never the raw IP) so cardinality stays bounded
    // (~operations × N keys per window) and no operation-global hot key forms
    // (GAP-O2). It fires only for requests that passed the per-key check, so a
    // per-key 429 above costs no swarm op. Uses the existing store.hit fixed-window
    // (60s) Lua EVAL -- no new Redis path, no setMultiplier, no second
    // getMultiplier (D2-B stays deferred). Errors propagate exactly as the per-key
    // hit does (no new fail-open / fail-closed / retry). Denials are logger-only
    // (privacy-safe, hashed IP); the G4-B1 first-breach chain audit is unchanged
    // and there is no SWARM_DETECTED literal.
    const ipForCluster = request.ip ?? "unknown";
    const clusterBucket =
      parseInt(
        createHmac("sha256", jwtSecret)
          .update(ipForCluster)
          .digest("hex")
          .slice(0, 8),
        16,
      ) % clusterCount;
    const swarmKey = `swarm:${opKey}:cluster:${clusterBucket}`;
    const swarmResult = await store.hit(swarmKey, windowSeconds);
    const swarmThreshold =
      swarmLimits[opKey] ?? swarmLimits.default ?? SWARM_DEFAULT_FALLBACK;
    if (swarmResult.count > swarmThreshold) {
      const ipHash = createHmac("sha256", jwtSecret)
        .update(ipForCluster)
        .digest("hex");
      request.log.warn(
        {
          event: "swarm_rate_limited",
          operation: opKey,
          cluster: clusterBucket,
          cluster_count: swarmResult.count,
          swarm_threshold: swarmThreshold,
          ip_hash: ipHash,
        },
        "gateway swarm cluster limit exceeded",
      );
      await reply
        .code(429)
        .header("Retry-After", String(swarmResult.ttl_seconds))
        .send({
          ok: false,
          error: "RATE_LIMIT_EXCEEDED",
          retry_after_seconds: swarmResult.ttl_seconds,
        });
      return;
    }
  };
}
