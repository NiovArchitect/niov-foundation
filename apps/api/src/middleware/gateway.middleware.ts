// FILE: gateway.middleware.ts
// PURPOSE: One Fastify onRequest hook that enforces per-operation
//          rate limits using a RateLimitStore. Login is IP-scoped;
//          everything else is entity-scoped (extracted from the
//          JWT without a DB call).
// CONNECTS TO: rate-limit.ts (the store), every route the gateway
//              gates by URL pattern.

import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { RateLimitStore } from "../rate-limit.js";

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
  negotiate: { perMinute: 100, scope: "entity" },
  read_metadata: { perMinute: 200, scope: "entity" },
  read_content: { perMinute: 50, scope: "entity" },
  write: { perMinute: 30, scope: "entity" },
  share: { perMinute: 20, scope: "entity" },
  audit_query: { perMinute: 10, scope: "entity" },
};

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
}) {
  const { store, limits, jwtSecret } = args;
  const windowSeconds = 60;

  return async function gatewayHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const operation = detectOperation(request.method, request.url);
    if (operation === null) return; // not gated
    const policy = limits[operation];
    if (policy === undefined) return; // unknown op

    let key: string;
    if (policy.scope === "ip") {
      key = `${operation}:ip:${request.ip ?? "unknown"}`;
    } else {
      const entityId = entityFromBearer(
        request.headers.authorization,
        jwtSecret,
      );
      if (entityId === null) {
        // No verifiable token -- fall back to IP-keyed bucket so
        // unauthenticated callers cannot share an entity bucket.
        key = `${operation}:ip:${request.ip ?? "unknown"}`;
      } else {
        key = `${operation}:entity:${entityId}`;
      }
    }

    const result = await store.hit(key, windowSeconds);
    if (result.count > policy.perMinute) {
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
  };
}
