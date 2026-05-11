# ADR-0023: Security Headers Posture

**Status**: Active
**Date**: 2026-05-11
**Trigger**: [SEC-HELMET] production-readiness audit pre-flight
verification surfaced security header substrate gap;
@fastify/helmet adoption canonical at engineering register.

## Context

Foundation pre-flight verification at production-readiness register
surfaced absence of HTTP security headers (HSTS, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, Cross-Origin-* policies)
at API tier. Existing substrate has @fastify/cors canonical at
`apps/api/src/server.ts:265` for cross-origin policy, but no
broader security header substrate.

Foundation operates as API-only register (no HTML served directly
from Foundation); CSP directives substantively-irrelevant for JSON
API responses at current substrate state. Frontend integration
substrate (control tower + future apps) not yet canonical at
Foundation register; CSP policy canonicalization deferred until
frontend integration scope canonical.

## Decision

Adopt `@fastify/helmet ^13.0.2` at `apps/api/src/server.ts`;
register BEFORE `@fastify/cors` (Pattern A) so security headers
land on every response including CORS preflight OPTIONS responses,
rate-limited 429 responses, and gateway hook rejections.

Helmet config canonical:

- `contentSecurityPolicy: false` (CSP deferred to forward queue)
- `crossOriginEmbedderPolicy: false` (COEP deferred to forward queue)
- `global: true` (explicit; helmet 8.x default)

Rely on helmet defaults for:

- **Strict-Transport-Security** (HSTS) — `max-age=15552000; includeSubDomains`
- **X-Frame-Options** — `SAMEORIGIN` (clickjacking protection)
- **X-Content-Type-Options** — `nosniff` (MIME sniffing protection)
- **Referrer-Policy** — `no-referrer` (referrer leak protection)
- **Cross-Origin-Resource-Policy** — `same-origin`
- **Cross-Origin-Opener-Policy** — `same-origin`
- **Origin-Agent-Cluster** — `?1`
- **X-DNS-Prefetch-Control** — `off`
- **X-Download-Options** — `noopen`
- **X-Permitted-Cross-Domain-Policies** — `none`

## Consequences

- Substantively-strengthens production-readiness at security
  register (HSTS + clickjacking + MIME sniffing + referrer leak +
  cross-origin policy protections canonical).
- CSP policy canonicalization deferred to forward queue when
  frontend integration substrate canonical (control tower scope +
  future apps scope).
- COEP canonicalization deferred to forward queue per same framing.
- swagger-ui at `/api/v1/docs` unaffected (CSP disabled at helmet
  config; swagger inline scripts + styles continue operational).
- Helmet plugin runs before cors plugin per Pattern A canonical;
  cors headers layer on top of helmet baseline; rate-limited 429
  responses receive both security headers and CORS headers.
- Caret pin discipline canonical at @fastify/* register preserved
  (`^13.0.2` per existing @fastify/cors / @fastify/swagger /
  @fastify/swagger-ui pattern).

## Alternatives Considered

- **Manual `reply.header` at every route handler** — rejected;
  substantively-error-prone; missed paths inevitable; no central
  policy source-of-truth.
- **Custom Fastify `onSend` hook for security headers** — rejected;
  duplicates @fastify/helmet substrate without substantive benefit;
  helmet is canonical Node.js ecosystem security headers library.
- **Helmet defaults (CSP enabled)** — rejected; restrictive default
  CSP (`default-src 'self'`) breaks swagger-ui at `/api/v1/docs`
  without operator-confirmed canonical CSP scope; defer to forward
  queue when frontend integration substrate canonical.
- **Helmet AFTER cors (Pattern B)** — rejected; helmet should run
  first so security headers land on CORS preflight OPTIONS
  responses and rate-limited 429 responses.
- **Helmet AFTER gateway hook (Pattern C)** — rejected; rate-limited
  429 responses would NOT receive security headers; substantive
  security-header gap during gateway rejection responses.
- **Status-quo (no security headers)** — rejected; pre-flight
  verification at production-readiness audit surfaced substantive
  gap.

## References

- ADR-0019 (cryptographic-suite-posture; CSPRNG context; posture-
  tier naming pattern this ADR follows)
- ADR-0006 (cross-org leak prevention; defense-in-depth at security
  register)
- ADR-0016 (Pin-and-Optimize Framework; caret pin discipline
  canonical at @fastify/* register preserved without amendment)
- Section 9C precedent (`7858f14` — CORS + IP whitelist + session
  timeout production-readiness substrate)
- RAA 12.7 §2.5 Zone U1 (audit chain integrity; security-tier
  substrate observation register)
- RULE 13 substrate-honest discipline (substrate truth at
  production-readiness audit register)

## Forward Queue

- **CSP policy canonicalization** when frontend integration
  substrate canonical (control tower scope + future apps scope);
  separate ADR amendment or new ADR.
- **COEP policy canonicalization** when same substrate canonical.
- **HSTS preload registration** when production HTTPS substrate
  canonical (chrome://net-internals/#hsts submission).
