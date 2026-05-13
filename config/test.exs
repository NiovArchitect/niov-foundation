# FILE: config/test.exs
# PURPOSE: Test environment configuration. Loaded when MIX_ENV=test
#          (`mix test` and CI Elixir job runs).
# CONNECTS TO:
#   config/config.exs (imports this file at the end).
# WHY: Sub-phase 5b-i [BEAM-COSMP-INTEROP-GRPC] adds gRPC server
#      disable for test env (avoids port-binding conflicts in CI;
#      gRPC server tests use mock client patterns instead of real
#      listener).

import Config

# Disable gRPC HTTP/2 listener in test env per ADR-0032 §Decision
# Connection management — tests use mock client patterns at the
# server-handler-function register, not the network-socket register.
config :cosmp_router, start_grpc_server: false
