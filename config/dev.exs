# FILE: config/dev.exs
# PURPOSE: Development environment configuration. Loaded when MIX_ENV=dev
#          (the default for `mix` commands without explicit env).
# CONNECTS TO:
#   config/config.exs (imports this file at the end).
# WHY: Sub-phase 2 [BEAM-MIX-WORKSPACE] minimal scaffold. Future
#      apps populate dev-specific config (verbose logging, dev DB,
#      hot-reload settings) as they land.

import Config
