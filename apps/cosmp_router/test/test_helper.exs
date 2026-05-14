# ExUnit framework start for the cosmp_router app.
# Sub-phase 3: minimal start.
# Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033:
# Ecto.Adapters.SQL.Sandbox.mode :manual so Postgres-touching tests
# explicitly check out a connection per-test (Sandbox.checkout/1)
# and roll back transactions at test end. Pure-compute tests (those
# with `async: true`) don't touch the Repo and don't need to check
# out — Sandbox.checkout is only called from setup blocks of tests
# that exercise CosmpRouter.Repo / Storage.Postgres / write_audit_event.

# Sub-phase 5b-iii Commit B.1 [BEAM-COSMP-INTEROP-INTEGRATION-ROUTER]:
# exclude :integration tag by default. DB-touching Router tests
# (composed-mode WRITE/SHARE/REVOKE/READ/AUDIT) are deferred to
# sub-phase 6 [BEAM-COSMP-INTEGRATION-TESTS] canonical home per
# test-granularity-tier coherence. Tag opt-in via:
#   mix test --include integration
ExUnit.start(exclude: [:integration])
Ecto.Adapters.SQL.Sandbox.mode(CosmpRouter.Repo, :manual)
