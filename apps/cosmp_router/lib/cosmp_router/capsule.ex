defmodule CosmpRouter.Capsule do
  @moduledoc """
  Capsule struct — placeholder per ADR-0031 §Decision Capsule placeholder.

  ## Patent-canonical 7-layer structure

  Per US 12,517,919, the Capsule comprises 7 layers in canonical order:

  1. **Payload** — the data the capsule carries
  2. **Metadata** — descriptive attributes (type, version, encoding)
  3. **Rules** — access + transformation rules attached to the payload
  4. **Relations** — graph relationships to other capsules
  5. **Time** — temporal attributes (created, modified, expires, valid-from/to)
  6. **Permissions** — DMW-level access grants + scope restrictions
  7. **Audit** — append-only audit-chain entries for this capsule

  Field ordering in `defstruct` mirrors patent layer ordering verbatim
  per ADR-0031 Q-J — patent-implementation evidence register strengthens
  when struct field order matches patent canonical ordering exactly.

  ## Sub-phase 4b status — placeholder only

  No validation logic at sub-phase 4b per ADR-0031 Q-B Option A.
  Full validation + persistence integration arrives at sub-phase 5
  `[BEAM-COSMP-INTEROP-CODE]` when gRPC interop populates Capsules from
  external payloads.

  ## References

  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision Capsule placeholder
  - US 12,517,919 (COSMP Protocol patent — 7-layer Capsule structure)
  """

  @type t :: %__MODULE__{
          payload: term(),
          metadata: map(),
          rules: list(),
          relations: list(),
          time: map(),
          permissions: map(),
          audit: list()
        }

  defstruct [:payload, :metadata, :rules, :relations, :time, :permissions, :audit]
end
