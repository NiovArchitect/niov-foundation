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

# Sub-phase 9 [BEAM-DBGI-LIBCLUSTER] per ADR-0028 §3 + ADR-0030 §DBGI
# canonical: empty topology default at umbrella-level register;
# deployment-target-specific topology configurable via
# Application.get_env(:libcluster, :topologies) override at deploy-time
# register per ADR-0018 deployment-agnostic canonical at substrate-
# architectural register. Cluster.Strategy.Epmd canonical at local-dev
# + test register; Cluster.Strategy.Gossip / Kubernetes / DNS at
# production deployment-target register substantively configurable per
# operator-deploy register.
config :libcluster,
  topologies: []

# Import env-specific config at the end (canonical Elixir pattern;
# allows env-specific overrides of any umbrella-level config above).
import_config "#{config_env()}.exs"
