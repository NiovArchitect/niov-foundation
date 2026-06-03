// FILE: python-client.ts
// PURPOSE: ADR-0090 §10 PY4 TypeScript client wrapper. The
//          governed boundary across which Foundation TypeScript
//          callers invoke a future Python Intelligence Runtime
//          computation per ADR-0090 §4 envelope spec + §5 SAFE
//          projection + §6 policy gate + §7 audit posture + §8
//          no-leak surface + §9 governance hook.
//
//          At THIS slice (per [FOUNDER-AUTH — CONTINUE AUTONOMOUS
//          LEI RUNTIME BUILD]) the inner transport is a deterministic
//          fixture provider. ADR-0090 §10 PY3 will eventually
//          replace the inner transport with a real HTTP client
//          connecting to the Foundation-internal Python Intelligence
//          Service over the boundary spec'd at ADR-0090 §10 PY2.
//
//          NO Python source code is added at this slice. NO
//          services/python/ Python repo scaffold. NO pyproject.toml.
//          NO requirements.txt. NO Python interpreter in CI. NO
//          pip invocation. NO LLM provider call. NO external model
//          API call. NO Python dependency.
//
//          The wrapper enforces envelope validation client-side
//          before any inner-transport call. The 7 no_leak_assertions
//          per ADR-0090 §4 are required and must all be `true`;
//          any missing assertion or false value is rejected at
//          entry without invoking the inner transport.
//
//          Per ADR-0090 §7: audit emission rides the existing
//          ADMIN_ACTION + details.action = "PYTHON_COMPUTATION_INVOKED"
//          / "PYTHON_COMPUTATION_COMPLETED" discriminator pattern.
//          NO new audit literal lands at this slice; the existing
//          ADMIN_ACTION literal at packages/database/src/queries/
//          audit.ts covers the substrate.
//
// CONNECTS TO:
//   - packages/database (writeAuditEvent for ADMIN_ACTION emissions)
//   - ADR-0090 §4 Foundation-scoped input envelope
//   - ADR-0090 §5 SAFE projection
//   - ADR-0090 §6 policy/auth gate
//   - ADR-0090 §7 audit posture (existing ADMIN_ACTION discriminator)
//   - ADR-0090 §8 no-leak surface
//   - ADR-0090 §9 governance hook
//   - ADR-0090 §10 PY1-PY10 ladder (this is the PY4 seat that PY3
//     will fill)

import { writeAuditEvent } from "@niov/database";

// WHAT: The closed-vocab purpose enum for Python computations.
// INPUT: Used as a discriminated string-literal union.
// OUTPUT: None.
// WHY: ADR-0090 §4 envelope requires a closed-vocab `purpose`.
//      V1 lands with the 2 fixture-only purposes per the Founder
//      direction "Start fixture-first." Future per-slice
//      authorizations will extend this enum as real Python
//      computations land.
export const PYTHON_PURPOSE_VALUES = [
  "HIVE_SIGNAL_SCORING_FIXTURE",
  "RECOMMENDATION_RANKING_FIXTURE",
] as const;

export type PythonPurpose = (typeof PYTHON_PURPOSE_VALUES)[number];

// WHAT: The closed-vocab no_leak_assertions object per ADR-0090
//        §4. Every key MUST be present and MUST be `true`.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Defense-in-depth at the envelope construction tier. Any
//      missing key or `false` value is rejected at validation
//      time without invoking the inner transport — the Python
//      service never sees a request that doesn't carry the full
//      no-leak assertion set.
export interface NoLeakAssertions {
  no_employee_scoring: true;
  no_manager_surveillance: true;
  no_psychological_inference: true;
  no_protected_attribute_inference: true;
  no_political_inference: true;
  no_health_inference: true;
  no_relationship_inference: true;
}

// WHAT: The retention class for the Python computation per ADR-0079
//        + ADR-0090 §4 scope_envelope.
export type PythonRetentionClass =
  | "STANDARD"
  | "AGGREGATE_ONLY"
  | "EPHEMERAL";

// WHAT: The scope envelope per ADR-0090 §4.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Tenant isolation + DMW scope + retention class are
//      mandatory at the envelope tier. The Python service uses
//      these to scope every computation.
export interface PythonScopeEnvelope {
  tenant_isolation: string; // org_entity_id (UUID)
  dmw_scope: string; // closed-vocab DMW scope identifier
  retention_class: PythonRetentionClass;
}

// WHAT: The Foundation-scoped input envelope per ADR-0090 §4.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Single typed shape every Python computation invocation
//      MUST carry. Constructed at the TypeScript service tier;
//      Python never builds it.
export interface PythonComputationEnvelope {
  envelope_version: "1.0";
  request_id: string; // UUID
  caller_entity_id: string; // UUID
  org_entity_id: string; // UUID
  purpose: PythonPurpose;
  consent_proof: string;
  scope_envelope: PythonScopeEnvelope;
  payload_safe: Record<string, unknown>;
  no_leak_assertions: NoLeakAssertions;
}

// WHAT: The SAFE-projected result discriminated union per ADR-0090
//        §5.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Closed-vocab + honest_note + redacted boolean per ADR-0061
//      §1.a pattern. Failure cases carry an outcome code for
//      audit emission.
export type PythonComputationResult =
  | {
      ok: true;
      request_id: string;
      org_entity_id: string;
      purpose: PythonPurpose;
      payload_safe: Record<string, unknown>;
      redacted: boolean;
      honest_note: string;
    }
  | {
      ok: false;
      request_id: string;
      org_entity_id: string;
      purpose: PythonPurpose;
      outcome:
        | "DENIED_ENVELOPE_INVALID"
        | "DENIED_NO_LEAK_FAILED"
        | "DENIED_PURPOSE_UNKNOWN"
        | "FAILED_TIMEOUT"
        | "FAILED_INTERNAL"
        | "NOT_CONFIGURED";
      code: string;
      message: string;
    };

// WHAT: The inner transport interface that PY3 will fill with a
//        real HTTP client. At this slice the only implementation
//        is FixturePythonTransport (deterministic outputs per
//        purpose).
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: DI hook for unit tests + the seat PY3 will fill. Mirrors
//      the VoiceProviderAdapter + SelfHostedCsm1bVoiceProvider
//      pattern landed at PR #234.
export interface PythonTransport {
  compute(
    envelope: PythonComputationEnvelope,
  ): Promise<PythonComputationResult>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// WHAT: Validate the envelope per ADR-0090 §4. Pure function.
// INPUT: An envelope (possibly malformed).
// OUTPUT: { ok: true } if every field passes; { ok: false, ... }
//         otherwise with a typed failure code.
// WHY: Defense-in-depth at the wrapper boundary. The Python
//      service ALSO validates per ADR-0090 §8 but the wrapper
//      catches malformed envelopes before any audit or transport.
export function validateEnvelope(
  envelope: PythonComputationEnvelope,
): { ok: true } | { ok: false; code: "ENVELOPE_INVALID"; message: string } {
  if (envelope.envelope_version !== "1.0") {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "envelope_version must be \"1.0\"",
    };
  }
  if (!UUID_RE.test(envelope.request_id)) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "request_id must be UUID",
    };
  }
  if (!UUID_RE.test(envelope.caller_entity_id)) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "caller_entity_id must be UUID",
    };
  }
  if (!UUID_RE.test(envelope.org_entity_id)) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "org_entity_id must be UUID",
    };
  }
  if (
    !(PYTHON_PURPOSE_VALUES as readonly string[]).includes(envelope.purpose)
  ) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: `purpose must be one of ${PYTHON_PURPOSE_VALUES.join(", ")}`,
    };
  }
  if (
    typeof envelope.consent_proof !== "string" ||
    envelope.consent_proof.length === 0
  ) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "consent_proof must be non-empty string",
    };
  }
  const se = envelope.scope_envelope;
  if (se === null || typeof se !== "object") {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "scope_envelope missing",
    };
  }
  if (se.tenant_isolation !== envelope.org_entity_id) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "scope_envelope.tenant_isolation must equal org_entity_id",
    };
  }
  if (typeof se.dmw_scope !== "string" || se.dmw_scope.length === 0) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: "scope_envelope.dmw_scope must be non-empty string",
    };
  }
  const validRetention = ["STANDARD", "AGGREGATE_ONLY", "EPHEMERAL"];
  if (!validRetention.includes(se.retention_class)) {
    return {
      ok: false,
      code: "ENVELOPE_INVALID",
      message: `scope_envelope.retention_class must be one of ${validRetention.join(", ")}`,
    };
  }
  return { ok: true };
}

// WHAT: Validate the no_leak_assertions per ADR-0090 §4 + §8.
// INPUT: A NoLeakAssertions object (possibly missing keys or
//        carrying false values).
// OUTPUT: { ok: true } if every key is present and === true;
//         { ok: false, ... } otherwise.
// WHY: ADR-0090 §8 enforcement boundary. The 7 keys are required;
//      ANY false or missing → DENIED at validation.
const REQUIRED_NO_LEAK_KEYS = [
  "no_employee_scoring",
  "no_manager_surveillance",
  "no_psychological_inference",
  "no_protected_attribute_inference",
  "no_political_inference",
  "no_health_inference",
  "no_relationship_inference",
] as const;

export function validateNoLeakAssertions(
  raw: Record<string, unknown>,
): { ok: true } | { ok: false; code: "NO_LEAK_FAILED"; missing: string[] } {
  const missing: string[] = [];
  for (const k of REQUIRED_NO_LEAK_KEYS) {
    if (raw[k] !== true) missing.push(k);
  }
  if (missing.length > 0) {
    return { ok: false, code: "NO_LEAK_FAILED", missing };
  }
  return { ok: true };
}

// WHAT: The default fixture transport. Deterministic outputs per
//        purpose; rejects any envelope it receives via the
//        substrate-honest invariant that this transport is
//        fixture-only.
// INPUT: Used as a concrete PythonTransport implementation.
// OUTPUT: None.
// WHY: PY3 will replace this default. Until PY3 lands, the
//      fixture transport returns deterministic SAFE outputs so
//      consumers can wire against the wrapper boundary without
//      requiring the actual Python service.
export class FixturePythonTransport implements PythonTransport {
  async compute(
    envelope: PythonComputationEnvelope,
  ): Promise<PythonComputationResult> {
    if (envelope.purpose === "HIVE_SIGNAL_SCORING_FIXTURE") {
      return {
        ok: true,
        request_id: envelope.request_id,
        org_entity_id: envelope.org_entity_id,
        purpose: envelope.purpose,
        payload_safe: {
          signal_label: "HIVE_SIGNAL_FIXTURE",
          score_band: "BAND_2",
        },
        redacted: false,
        honest_note:
          "Fixture-only deterministic output from the PY4 wrapper " +
          "FixturePythonTransport. PY3 will replace this with a real " +
          "computation via the Foundation-internal Python Intelligence " +
          "Service.",
      };
    }
    if (envelope.purpose === "RECOMMENDATION_RANKING_FIXTURE") {
      return {
        ok: true,
        request_id: envelope.request_id,
        org_entity_id: envelope.org_entity_id,
        purpose: envelope.purpose,
        payload_safe: {
          ranking_label: "RANKING_FIXTURE",
          band: "BAND_1",
        },
        redacted: false,
        honest_note:
          "Fixture-only deterministic output from the PY4 wrapper " +
          "FixturePythonTransport. PY3 will replace this with a real " +
          "computation via the Foundation-internal Python Intelligence " +
          "Service.",
      };
    }
    return {
      ok: false,
      request_id: envelope.request_id,
      org_entity_id: envelope.org_entity_id,
      purpose: envelope.purpose,
      outcome: "DENIED_PURPOSE_UNKNOWN",
      code: "DENIED_PURPOSE_UNKNOWN",
      message: `Unknown purpose ${envelope.purpose}`,
    };
  }
}

// WHAT: The PY4 client wrapper that callers invoke.
// INPUT: Optional inner transport for DI (defaults to
//        FixturePythonTransport at this slice).
// OUTPUT: PythonComputationResult discriminated union.
// WHY: ADR-0090 §10 PY4 seat. The wrapper enforces:
//        - envelope validation (ADR-0090 §4)
//        - no-leak assertion validation (ADR-0090 §8)
//        - audit emission BEFORE transport per RULE 4 +
//          ADR-0090 §7 (ADMIN_ACTION + details.action =
//          "PYTHON_COMPUTATION_INVOKED")
//        - audit emission AFTER transport per RULE 4 +
//          ADR-0090 §7 (ADMIN_ACTION + details.action =
//          "PYTHON_COMPUTATION_COMPLETED")
//      Audit emissions use the existing ADMIN_ACTION literal +
//      details.action discriminator pattern; NO new audit literal
//      lands at this slice.
export class PythonIntelligenceClient {
  private readonly transport: PythonTransport;

  constructor(transport?: PythonTransport) {
    this.transport = transport ?? new FixturePythonTransport();
  }

  async compute(
    envelope: PythonComputationEnvelope,
  ): Promise<PythonComputationResult> {
    // 1. Envelope shape validation
    const ev = validateEnvelope(envelope);
    if (ev.ok === false) {
      return {
        ok: false,
        request_id: envelope.request_id,
        org_entity_id: envelope.org_entity_id,
        purpose: envelope.purpose,
        outcome: "DENIED_ENVELOPE_INVALID",
        code: ev.code,
        message: ev.message,
      };
    }
    // 2. No-leak assertion validation
    const nv = validateNoLeakAssertions(
      envelope.no_leak_assertions as unknown as Record<string, unknown>,
    );
    if (nv.ok === false) {
      return {
        ok: false,
        request_id: envelope.request_id,
        org_entity_id: envelope.org_entity_id,
        purpose: envelope.purpose,
        outcome: "DENIED_NO_LEAK_FAILED",
        code: nv.code,
        message: `Missing no_leak_assertions: ${nv.missing.join(", ")}`,
      };
    }
    // 3. Audit emission BEFORE transport per RULE 4 + ADR-0090 §7.
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: envelope.caller_entity_id,
      target_entity_id: envelope.org_entity_id,
      details: {
        action: "PYTHON_COMPUTATION_INVOKED",
        request_id: envelope.request_id,
        org_entity_id: envelope.org_entity_id,
        purpose: envelope.purpose,
        retention_class: envelope.scope_envelope.retention_class,
      },
    });
    // 4. Inner transport
    const r = await this.transport.compute(envelope);
    // 5. Audit emission AFTER transport per RULE 4 + ADR-0090 §7.
    const completedOutcome =
      r.ok === true ? "SUCCESS" : "DENIED";
    const completedDetails: Record<string, unknown> = {
      action: "PYTHON_COMPUTATION_COMPLETED",
      request_id: envelope.request_id,
      org_entity_id: envelope.org_entity_id,
      purpose: envelope.purpose,
      retention_class: envelope.scope_envelope.retention_class,
      outcome_code: r.ok === true ? "SUCCESS" : r.outcome,
    };
    if (r.ok === true) {
      completedDetails.redacted = r.redacted;
    }
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: completedOutcome,
      actor_entity_id: envelope.caller_entity_id,
      target_entity_id: envelope.org_entity_id,
      details: completedDetails,
    });
    return r;
  }
}
