# Live Test Results — 2026-06-04

> Companion to `docs/operations/otzar-company-live-test-runbook.md`.
> Captures the state of Foundation + Control Tower + Python + BEAM
> + Desktop after the [FOUNDER-AUTH — FULL DEPLOYED RUNTIMES /
> CONNECTOR-MCP ONBOARDING / DOCKER-CI-STAGING / TAURI DESKTOP /
> COMPANY TEST EXECUTION] directive autonomous build pass.

## 1. What's live after this pass

| Surface | State | Lineage |
|---|---|---|
| Foundation API (Fastify + Prisma) | live | unchanged baseline + 4 new connector-rails routes |
| Foundation API container image | builds in CI | PR #294 + Dockerfile fixes |
| Python intelligence runtime | live (containerized service) | PR #291 |
| BEAM Collaboration Supervisor (Elixir/OTP) | live (containerized service) | PR #292 |
| docker-compose.local.yml | live (full stack) | PR #294 |
| GitHub Actions deploy workflows | scaffolded + graceful-skip-when-unconfigured | PR #295 |
| Foundation TS canonical baseline | **zero TS errors** | PR #297 |
| Connector + MCP rails (Prisma + service) | live | PR #296 |
| Connector + MCP rails admin routes | live (10 routes) | PR #298 |
| Otzar desktop shell (Tauri 2.x) | macOS .app built end-to-end | CT PR #42 |
| Control Tower /connector-rails admin UI | live | CT PR #43 |

## 2. Foundation PR sequence (this directive)

| PR | Slice |
|---|---|
| Foundation #291 | Python intelligence FastAPI service skeleton |
| Foundation #292 | apps/collaboration_supervisor BEAM umbrella app |
| Foundation #294 | Dockerfiles + docker-compose.local.yml |
| Foundation #295 | GitHub Actions build-images + deploy-staging + deploy-production |
| Foundation #296 | Connector + MCP rails substrate (schema + services + tests) |
| Foundation #297 | Move from 4-error to **zero-error TypeScript baseline** |
| Foundation #298 | Connector + MCP rails admin HTTP surface (10 routes) |

## 3. Control Tower PR sequence (this directive)

| PR | Slice |
|---|---|
| CT #41 | CT Dockerfile (Vite build → nginx static serve) |
| CT #42 | Tauri 2.x desktop shell (macOS .app built end-to-end) |
| CT #43 | `/connector-rails` admin page |

## 4. Build verification end-to-end

### Foundation API container
```
docker build -t niov/foundation-api:dev .
✓ deps stage: openssl + ca-certificates installed before Prisma generate
✓ runtime stage: non-root niov:1001 user, tini PID 1, HEALTHCHECK on /health
✓ exercised in CI on every PR touching container paths
```

### Python intelligence container
```
docker build -t niov/python-intelligence:dev services/python-intelligence
✓ python:3.11-slim base
✓ container-up + /health 200 smoke verified in build-images.yml
```

### BEAM Collaboration Supervisor container
```
docker build -t niov/collaboration-supervisor:dev -f apps/collaboration_supervisor/Dockerfile .
✓ hexpm/elixir:1.19.5-erlang-28.5.0.1-debian-bookworm-20260518-slim
✓ exercised in CI; passes after the image-tag correction
```

### Tauri desktop shell (macOS)
```
export PATH="$HOME/.cargo/bin:$PATH"
cd otzar-control-tower && npm install
npx tauri info   # Tauri 2.x + Rust 1.96 + Erlang/Elixir not required
npm run build
npx tauri build --bundles app
✓ target/release/otzar-desktop   11.3 MB Mach-O 64-bit x86_64
✓ target/release/bundle/macos/Otzar.app   11 MB
```

## 5. Three-tier credential separation

Verified across the substrate per `docs/deployment/cloud-portability.md` §2:

| Tier | Vault path | Examples | Where stored |
|---|---|---|---|
| NIOV PLATFORM | `niov/platform/{env}/*` | DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY | Azure Key Vault / AWS Secrets Manager |
| CUSTOMER TENANT | `niov/tenants/{org_entity_id}/connectors/{connection_id}/secret` + `niov/tenants/{org_entity_id}/mcp/{mcp_connection_id}/secret` | Slack OAuth, Google Workspace OAuth, MCP server credentials | Same vault, separate prefix |
| EMPLOYEE-SCOPED | (Postgres) `twin_authority_grants` rows | Per-employee Twin grants | Foundation DB |

### Verified non-storage points

- No customer connector keys appear in `.env.example` ✓ (PR #290)
- No customer connector keys in `docker-compose.local.yml` ✓ (PR #294)
- No customer connector keys in GitHub Actions secrets posture ✓ (PR #295)
- `McpServerConnection.secret_ref` shape-check rejects raw-secret-shaped values ✓ (PR #296 integration test J7)
- Control Tower `secret_ref` input copy says "vault PATH only" ✓ (CT #43)
- Audit emits `secret_ref_present: boolean`, never the value ✓ (PR #298)

## 6. Closed-vocab discipline preserved

Every new substrate added in this directive uses closed-vocab string unions / Prisma enums for state, reason, outcome, scope, operation_class. No free-form strings sneak into:

- ConnectorScopeType / ConnectorOperationClass
- McpAuthMode / McpServerStatus / McpToolPolicyMode / McpOperationClass / McpPolicyOutcome
- Voice provider_mode (TEXT_ONLY / LOCAL_MOCK / SESAME / FUTURE)
- BEAM provider_mode (DISABLED / READY_NOT_ACTIVE / ACTIVE / UNREACHABLE)
- Python ranker fallback_reason (PROVIDER_DISABLED / PROVIDER_URL_NOT_SET / PROVIDER_TIMEOUT / PROVIDER_INVALID_RESPONSE / PROVIDER_ERROR)

## 7. Safety invariants verified

- No raw memory leakage on any employee surface ✓
- No raw transcript vault ✓
- No chain-of-thought storage ✓
- No employee scoring, manager monitoring, or surveillance framing ✓
- Cross-tenant blocked at substrate (CROSS_ORG_DENIED) ✓
- Audit chain append-only (audit_events BEFORE DELETE trigger per ADR-0002) ✓
- Connector writes blocked / draft-only unless explicitly authorized ✓
- WRITE_EXECUTE in a scope grant REQUIRES requires_dual_control=true at create time ✓
- McpToolPolicy defaults: NEEDS_APPROVAL + requires_employee_authority=true + requires_dmw_scope=true ✓
- Voice live mic + raw audio retention default OFF ✓
- No Apple/Microsoft code-signing certs in repo ✓
- Tauri capability allowlist limited to core:default + shell:allow-open + opener:default ✓

## 8. Voice/Sesame path status

The voice provider seam (Phase 8 of the directive) was **substantively already in place** before this directive:

- VoiceProviderAdapter interface ✓
- TextOnlyVoiceProvider ✓
- LocalMockVoiceProvider ✓
- SelfHostedCsm1bVoiceProvider seat ✓ (delegates to LocalMockVoiceProvider at this slice; VS5 will land real CSM-1B inference)
- voice-intent-envelope.ts ✓
- VOICE_PROVIDER / VOICE_OUTPUT_ENABLED / LIVE_MIC_CAPTURE_ENABLED / RAW_AUDIO_RETENTION_ENABLED env vars documented in `.env.example` + wired into docker-compose.local.yml ✓
- DMW voice access log ✓

No voice substrate added in this directive — the existing substrate is the spec. Real CSM-1B inference is forward-substrate until Founder authorizes ADR-0089 VS5.

## 9. Known limitations (not blockers)

- **Connector writes**: still draft/proposal/approval-required only. Phase 7 (Founder-authorized execution path) requires the existing ConnectorScopeGrant + the dual-control middleware (ADR-0026) to gate the WRITE_EXECUTE path. Substrate is in place; activation is per-vendor + Founder-authorized.
- **Live audio**: mic capture + raw retention default OFF. Self-hosted CSM-1B real inference is forward-substrate.
- **Production GitHub Environments**: `staging` + `production` environments need to be created by the Founder via repo settings + per-environment vars/secrets configured. Workflows graceful-skip until then.
- **Container registry**: `REGISTRY_KIND` repo var is unset; image builds verify locally but are not pushed to ACR/ECR/GHCR until the Founder authorizes a registry choice.
- **Tauri code-signing**: macOS notarization + Windows code-signing certs are forward-substrate. Unsigned dev builds work via `npx tauri build`.
- **Windows Tauri build**: not yet verified end-to-end (macOS done; Windows targets are scaffolded but not cross-built from macOS).

## 10. Activation matrix (what unlocks each forward-substrate item)

| Item | Unlock |
|---|---|
| Production GitHub deploys | Founder creates `staging` + `production` GitHub Environments + sets `CLOUD_TARGET=azure` or `aws` + per-environment OIDC/secrets |
| Image-registry push | Founder sets `vars.REGISTRY_KIND=ghcr/acr/ecr` + relevant secrets |
| Real CSM-1B voice | Founder authorizes ADR-0089 VS5 (legal/retention/provider decision) |
| Live mic capture | Set `LIVE_MIC_CAPTURE_ENABLED=true` AFTER explicit consent + retention posture decision |
| Connector WRITE_EXECUTE | Per-vendor: customer admin creates ConnectorBinding + sets WRITE-enabled write_mode + creates ConnectorScopeGrant with `allowed_operations: [WRITE_EXECUTE]` + `requires_dual_control: true` (enforced at create time) + Founder authorizes for Founder-gated providers |
| Apple notarization | Founder acquires signing cert; CI desktop-build workflow lands skip-when-absent posture |
| Windows code-signing | Founder acquires Windows cert; same skip-when-absent posture |

## 11. Final state

- Foundation unit tier: **1918/1918 passing**
- Foundation TS errors: **0** (was 4)
- Control Tower tests: **506/506 passing**
- Control Tower TS errors: **0**
- All container images: build cleanly in CI
- All four CI tiers (Typecheck / Unit / Integration / Elixir) + Python tier: green on main
- Tauri macOS build: end-to-end verified (`.app` bundle produced)

## 12. What is genuinely usable today

A customer pilot can be run end-to-end:

1. `docker compose -f docker-compose.local.yml up --build -d` brings up postgres + Foundation API + Python intelligence + BEAM Collaboration Supervisor
2. `npm run dev` in `otzar-control-tower` brings up the web Control Tower
3. Operator admin creates a test COMPANY + PERSON + AI_AGENT entity (per `docs/operations/otzar-company-live-test-runbook.md` §2.4)
4. Employee walks through MyTwinView, authority grants, preferences, collaboration, work projects, voice-ready chat, free-form correction (per §3)
5. Admin walks through `/collaboration-policy` presets, `/connectors` read-first vendors, `/connector-rails` MCP onboarding (per §4)
6. Macos desktop testers also have an `Otzar.app` build available via `npx tauri build` after `npm install`

The deployment workflows + container images + cloud documentation are ready for the Founder to acquire cloud accounts and flip the `staging` environment from graceful-skip to live deploys.
