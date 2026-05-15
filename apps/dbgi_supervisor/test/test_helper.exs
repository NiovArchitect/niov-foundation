# ExUnit framework start for the dbgi_supervisor app.
# Sub-phase 7 [BEAM-DBGI-APP-SKELETON]: minimal start.
# Sub-phase 10 [BEAM-DBGI-INTEGRATION-TESTS]: exclude :integration
# tag by default canonical (mirrors cosmp_router sub-phase 5b-iii
# canonical at substantive register). Multi-node integration tests
# (`:peer`-driven cluster formation + cross-node :pg + Phoenix.Tracker
# CRDT replication + Phoenix.PubSub broadcast) are deferred to
# integration tier per ADR-0011 three-tier stratification canonical;
# tag opt-in via `mix test --include integration`. Default tier
# preserves fast unit-tier runtime budget per
# D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th canonical
# substrate-build observation.
ExUnit.start(exclude: [:integration])
