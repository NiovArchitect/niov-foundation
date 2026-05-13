# FILE: config/test.exs
# PURPOSE: Test environment configuration. Loaded when MIX_ENV=test
#          (`mix test` and CI Elixir job runs).
# CONNECTS TO:
#   config/config.exs (imports this file at the end).
# WHY: Sub-phase 2 [BEAM-MIX-WORKSPACE] minimal scaffold. Future apps
#      populate test-specific config (ExUnit settings, test database
#      connections, log-level overrides) as they land at sub-phases
#      3-10.

import Config
