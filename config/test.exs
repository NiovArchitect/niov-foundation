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

# Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033 §Decision
# Q-PG-TEST: connect Repo to the local containerized Postgres at
# localhost:5433/foundation_test (the niov-foundation-test-db Colima
# container per ADR-0013 + ADR-0015 postgres:16.4-alpine pin).
# Shared with Foundation TypeScript unit tier; RULE 15 single-cycle
# discipline applies. SQL.Sandbox pool wraps each test in a transaction
# rolled back at test end for isolation; Prisma-pushed schema present.
config :cosmp_router, CosmpRouter.Repo,
  url: "postgresql://postgres:postgres@localhost:5433/foundation_test",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 10,
  prepare: :unnamed,
  log: false

# Sub-phase 11 [BEAM-OBSERVABILITY]: disable Telemetry supervisors in
# test env to avoid Prometheus HTTP endpoint port binding canonical
# at substantive register substantively (port 9568 cosmp_router +
# port 9569 dbgi_supervisor); prevents CI parallel test conflicts +
# RULE 15 single-cycle discipline coherence canonical at substantive
# register substantively. Telemetry behavior tested via direct
# Telemetry.Metrics + :telemetry.attach handlers at unit-tier
# canonical at substantive register substantively without supervisor
# startup.
config :cosmp_router, start_telemetry: false
config :dbgi_supervisor, start_telemetry: false
