# FILE: config/prod.exs
# PURPOSE: Production environment configuration. Loaded when MIX_ENV=prod
#          (build-time; release artifacts only).
# CONNECTS TO:
#   config/config.exs (imports this file at the end).
#   config/runtime.exs (future; runtime-resolved production config —
#     env vars, secrets — lands when first prod-grade app ships).
# WHY: Sub-phase 2 [BEAM-MIX-WORKSPACE] minimal scaffold. Future home
#      for release-time runtime config (Config.config_env() == :prod
#      gates). The runtime config pattern is canonical Elixir for
#      secrets + env-var-resolved values.

import Config
