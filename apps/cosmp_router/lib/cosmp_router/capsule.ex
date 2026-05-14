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

  ## Sub-phase substrate landing lineage (D-CASCADE-7 semantic split)

  - Sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` — placeholder per
    ADR-0031 Q-B Option A; struct-only; no validation logic
  - Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` — validation primitives
    land via `CosmpRouter.Capsule.Validator`; gRPC interop populates
    Capsules from external payloads
  - Sub-phase 5b-ii `[BEAM-COSMP-INTEROP-PERSISTENCE]` — persistence
    substrate lands via `CosmpRouter.MemoryCapsule` (Ecto schema) +
    `CosmpRouter.Capsule.Translator` (pack/unpack 7-layer ↔ 30-field
    projection) per ADR-0033 §Decision 3a-3b
  - Sub-phase 5b-iii Commit B.1 `[BEAM-COSMP-INTEROP-INTEGRATION-ROUTER]`
    — composed-mode integration at Router register: WRITE/SHARE/REVOKE
    use Ecto.Multi wrapping Storage.put + Audit.write_audit_event/3 +
    Idempotency.check/record per ADR-0033 §Decision 4e + RULE 4 atomic
    compound; in-memory `audit` array semantics REPLACED with Postgres
    `audit_events` emission (caller queries audit_chain_for_capsule/1
    on-demand)

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
