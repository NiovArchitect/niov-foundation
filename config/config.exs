# FILE: config/config.exs
# PURPOSE: Umbrella-level configuration root. Loaded for all environments
#          before env-specific config imports at the bottom.
# CONNECTS TO:
#   docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md
#     (§Implementation Detail mix umbrella workspace structure).
#   config/{dev,prod,test}.exs (env-specific configs imported at end).
# WHY: Sub-phase 2 [BEAM-MIX-WORKSPACE] minimal scaffold. Sub-phases
#      3-10 of the Block B mini-arc populate as apps and their config
#      requirements land.

import Config

# Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033:
# register CosmpRouter.Repo as the canonical Ecto repo for the
# cosmp_router OTP app. Per-env connection details land in
# config/{dev,test,runtime}.exs.
config :cosmp_router, ecto_repos: [CosmpRouter.Repo]

# Import env-specific config at the end (canonical Elixir pattern;
# allows env-specific overrides of any umbrella-level config above).
import_config "#{config_env()}.exs"
