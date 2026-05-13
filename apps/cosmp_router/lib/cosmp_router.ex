defmodule CosmpRouter do
  @moduledoc """
  COSMP coordination layer for the NIOV Foundation per ADR-0030
  (Phase 2 Elixir/BEAM Implementation).

  ## Patent-canonical role

  Implements message routing for the 7 COSMP operations defined in
  US 12,517,919: AUTHENTICATE, NEGOTIATE, READ, WRITE, SHARE, REVOKE,
  AUDIT. The router is the BEAM-side counterpart to the Fastify
  TypeScript API; inbound COSMP operations cross the gRPC bridge
  (sub-phase 5) into this app's GenServer (sub-phase 4) for routing
  against the metadata-first retrieval surface.

  ## Scale register

  Each DMW (Personal / Enterprise / Device) may hold billions of
  memory capsules. Cross-DMW collaboration through permissioned
  sharing multiplies the routing surface. Production live-grade
  coherence at this scale demands per-worker failure isolation
  (`:one_for_one` supervision; see `CosmpRouter.Application`).

  ## Sub-phase 3 status

  Skeleton only. The substantive routing logic lands at sub-phase 4
  `[BEAM-COSMP-GENSERVER]`; interop at sub-phase 5b-i
  `[BEAM-COSMP-INTEROP-GRPC]`; integration tests at sub-phase 6
  `[BEAM-COSMP-INTEGRATION-TESTS]`.

  ## References

  - ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase 3
  - ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer)
  - ADR-0026 (6 BEAM-compatibility patterns) §5
  - US 12,517,919 (COSMP Protocol patent)
  """
end
