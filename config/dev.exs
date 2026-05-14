# FILE: config/dev.exs
# PURPOSE: Development environment configuration. Loaded when MIX_ENV=dev
#          (the default for `mix` commands without explicit env).
# CONNECTS TO:
#   config/config.exs (imports this file at the end).
#   config/runtime.exs (DATABASE_URL resolved at runtime for dev + prod
#     per ADR-0033 §Decision Q-PG-TEST + D-5BII-EXEC-7 Option α).
# WHY: Sub-phase 2 [BEAM-MIX-WORKSPACE] minimal scaffold; sub-phase
#      5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] adds Repo dev-tier
#      defaults (pool size + prepare semantics). DATABASE_URL stays
#      runtime-resolved so contributors shell-source .env without
#      a Hex .env-loader dep.

import Config

# Sub-phase 5b-ii per ADR-0033 §Decision: dev-tier Repo defaults; the
# url is resolved at config/runtime.exs from System.get_env("DATABASE_URL").
# prepare: :unnamed required for Supabase pgbouncer transaction-mode
# compatibility (no session-level prepared statements supported).
config :cosmp_router, CosmpRouter.Repo,
  pool_size: 10,
  prepare: :unnamed
