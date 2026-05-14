# ExUnit framework start for the cosmp_router app.
# Sub-phase 3: minimal start.
# Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033:
# Ecto.Adapters.SQL.Sandbox.mode :manual so Postgres-touching tests
# explicitly check out a connection per-test (Sandbox.checkout/1)
# and roll back transactions at test end. Pure-compute tests (those
# with `async: true`) don't touch the Repo and don't need to check
# out — Sandbox.checkout is only called from setup blocks of tests
# that exercise CosmpRouter.Repo / Storage.Postgres / write_audit_event.

ExUnit.start()
Ecto.Adapters.SQL.Sandbox.mode(CosmpRouter.Repo, :manual)
