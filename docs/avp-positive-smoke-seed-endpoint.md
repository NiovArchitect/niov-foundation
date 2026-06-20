# AVP² Positive-Smoke Seed Endpoint (local/dev)

`POST /api/v1/foundation/avp2/admin/positive-smoke/seed`

A **local/dev-only** operator helper that creates (or idempotently reuses) a
**safe, non-production** AVP² listing + resource so the niov-avp positive live
smoke can drive the real governed loop — manifest/resources → quote → accept →
access receipt → proof — against Foundation.

> The agent does not scrape the website. The agent asks for a quote.
> Seed endpoint creates safe test data. Seed endpoint does not prove the live
> AVP² loop by itself. Live PASS requires quote → accept → access receipt → proof.

## Purpose / non-goals

It prepares data through the **same** `FoundationMarketplaceService.createListingForCaller`
path used by `POST /api/v1/foundation/marketplace/listings`, so the seeded listing
is a first-class governed listing the AVP² resource-contract projection + quote/
accept/access services read from — never isolated data, never a governance bypass.

Not public, not real payment, not production data, not a content-delivery endpoint.

## Enablement + auth

- **Disabled by default.** Returns `404 SEED_NOT_ENABLED` unless
  `FOUNDATION_ENABLE_LOCAL_AVP_SEED=true`.
- **Refuses in production.** Returns `403 SEED_DISABLED_IN_PRODUCTION` when
  `NODE_ENV=production`.
- **Authenticated.** Requires a valid session `Authorization: Bearer <token>`
  (the provider). Not an unauthenticated admin route. Use the existing
  `POST /api/v1/foundation/auth/login` to obtain a local session token. The token
  is never logged, never returned, never stored in the result.

## Request

The body is optional; safe defaults are always applied. Explicitly unsafe flags
are refused:

| Body field | Refusal code (422) |
| --- | --- |
| `real_payment: true` | `REAL_PAYMENT_NOT_ALLOWED` |
| `public_listing: true` | `PUBLIC_LISTING_NOT_ALLOWED` |
| `production_data: true` | `PRODUCTION_DATA_NOT_ALLOWED` |
| `contains_private_user_data: true` | `PRIVATE_USER_DATA_NOT_ALLOWED` |
| `settlement_mode` ≠ `MOCK_CREDITS`/`MOCK_ONLY` | `SAFE_SEED_REQUIRED` |
| `listing.protocol` ≠ `AVP2` | `UNSUPPORTED_PROTOCOL` |
| `resource.resource_type` ∉ {CONTENT_FRAGMENT, ACTION} | `UNSUPPORTED_RESOURCE_TYPE` |
| training/redistribution/commercial-AI = true, or any secret/payment marker | `SAFE_SEED_REQUIRED` / `REAL_PAYMENT_NOT_ALLOWED` |

## Response (flat; the niov-avp materializer reads these top-level)

```json
{
  "ok": true,
  "listing_id": "…",
  "resource_id": "avp-positive-smoke.content-fragment",
  "foundation_base_url": "http://127.0.0.1:<port>/api/v1",
  "selector": "paragraph_range:12-15",
  "delivered_required": false,
  "settlement_mode": "MOCK_CREDITS",
  "real_payment": false,
  "public_listing": false,
  "production_data": false,
  "contains_private_user_data": false
}
```

Never contains a bearer/access token, token hash, Authorization header, private
key, raw content, or proof body. `foundation_base_url` is taken from
`FOUNDATION_PUBLIC_BASE_URL` when set, else derived from the request
(`<proto>://<host>/api/v1`).

## Idempotency

A stable seed key (`trust_metadata.seed_key = "avp-positive-smoke-v0.1"`) +
fixed title means repeated safe calls by the same caller **reuse** the existing
listing rather than creating duplicates.

## How niov-avp consumes it

The niov-avp seed materializer posts the safe-seed body here and maps the response
into `AVP_FOUNDATION_*` env. The default materializer endpoint is
`/avp/admin/positive-smoke/seed`; point it at this route via
`AVP_FOUNDATION_SEED_ENDPOINT=/api/v1/foundation/avp2/admin/positive-smoke/seed`.

```bash
export AVP_FOUNDATION_SEED_BASE_URL='http://127.0.0.1:<port>'
export AVP_FOUNDATION_SEED_ENDPOINT='/api/v1/foundation/avp2/admin/positive-smoke/seed'
export AVP_FOUNDATION_SEED_BEARER_TOKEN='PASTE_LOCAL_SESSION_TOKEN'   # local only
npm run foundation:seed-positive -- --apply --confirm-safe-seed --output /tmp/avp-foundation-seed-result.json --force
npm run foundation:seed-positive -- --from-result /tmp/avp-foundation-seed-result.json --print-env
# then in niov-avp, with AVP_FOUNDATION_BASE_URL=http://127.0.0.1:<port>/api/v1 + listing/resource ids:
npm run smoke:foundation-positive:readiness -- --strict
npm run smoke:foundation-positive -- --strict
```

## Repeatable local live server harness (F-1363)

`npm run avp:positive-live-server` (`scripts/avp-positive-live-server.mts`) boots the
real Fastify app against the **local test DB** with in-memory nonce/rate stores,
enables the dev-gated seed endpoint, and mints a local session token through the
real `/api/v1/foundation/auth/login` path — writing safe runtime metadata to
`/tmp/avp-live.json` (chmod 600, token local-only, never committed).

Safety: it loads `.env.test` with **`override: true`** and dynamic-imports the
workspace packages **after**, so the Prisma client is built against
`localhost:5433`, never the root `.env` production target; it refuses
`NODE_ENV=production` and a non-local `DATABASE_URL` (unless
`AVP_LIVE_ALLOW_NONLOCAL_DB=true`); the READY line prints `token=[REDACTED]`.

The niov-avp orchestrator `npm run foundation:positive:live-local` drives this
harness end-to-end (DB up → server → local auth → seed apply → readiness `--strict`
→ positive smoke `--strict` → cleanup) and is the one-command **local live PASS**.
Anchored by `tests/unit/avp-positive-live-server-safety.test.ts`.

> Local live PASS = real Foundation app + local/test DB + real auth/session + real
> seed endpoint + real AVP² quote/accept/access/proof. It is **not** hosted
> production proof.

## Tests

`tests/integration/foundation-avp2-positive-smoke-seed.test.ts` proves: disabled
by default, production refusal, auth required, all safety refusals, safe create +
idempotency, no secret leakage, and — the live-proof point — that the seeded
listing is discoverable and drives a real **quote → accept → access → proof**
(`delivered:false`, mock-only, no content).
