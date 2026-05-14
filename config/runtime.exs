# FILE: config/runtime.exs
# PURPOSE: Runtime configuration resolved AFTER compile, BEFORE app
#          start. Canonical Elixir register for env-var-resolved
#          values + secrets that cannot be baked into compile-time
#          config (config/{config,dev,prod,test}.exs).
# CONNECTS TO:
#   config/config.exs + config/dev.exs + config/prod.exs (compile-time
#     defaults that runtime.exs may override per env-var presence).
#   apps/cosmp_router/lib/cosmp_router/repo.ex (Ecto.Repo this file
#     resolves the DATABASE_URL for).
#   docs/architecture/decisions/0033-beam-persistence-idempotency-audit-chain-architecture.md
#     §Decision 9 DATABASE_URL loading + D-5BII-EXEC-7 Option α
#     (System.get_env discipline; no :dotenvy Hex dep).
# WHY: Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] introduces
#      the runtime config register so production + dev resolve
#      DATABASE_URL from env at app-start. Test env hardcodes the
#      local container URL at compile-time per config/test.exs;
#      this file does NOT override test config.
#
# Contributor onboarding: local dev contributors shell-source .env
# before invoking mix run / iex -S mix:
#
#   set -a; source .env; set +a; iex -S mix
#
# CI workflow injects DATABASE_URL via the Postgres service block
# in .github/workflows/ci.yml Elixir tier (per ADR-0033 §Decision
# Q-PG-TEST + D-5BII-EXEC-2). Production deploys inject via the
# release substrate (out of sub-phase 5b-ii scope).

import Config

# Test env Repo config is hardcoded at config/test.exs to point at
# the localhost:5433/foundation_test container. Skip runtime override
# for test to preserve isolation discipline.
if config_env() != :test do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      DATABASE_URL environment variable is not set. Sub-phase 5b-ii
      [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033 §Decision 9 requires
      DATABASE_URL at runtime for dev + prod environments.

      Local dev: shell-source .env before mix invocation:
        set -a; source .env; set +a; iex -S mix

      Production: inject via release deploy substrate.
      """

  config :cosmp_router, CosmpRouter.Repo, url: database_url
end
