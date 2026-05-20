// FILE: working-set.service.ts
// PURPOSE: Foundation/COSMP working-set orchestrator for the
//          personalization-orchestration substrate (ADR-0048 Phase 3
//          Sub-Arc 3; PERS.3 per Q-PERS.3-α/β). The dominant Foundation
//          entry point that COMPOSES the proven governed substrate into
//          one fast, secure, coherent working set: it resolves the
//          session's authoritative wallet context, derives the
//          personal/enterprise domain from the established wallet_type,
//          resolves the PERS.2 permission envelope + moment context, and
//          WRAPS the governed COE assembleContext capsule-retrieval path.
//          The Foundation constructs the governed working set BEFORE the
//          LLM sees context; the LLM never decides what memory it may see.
//
//          Q-PERS.3 locks:
//            - β-1: WRAP/compose assembleContext; never mutate COE.
//            - γ-1: service-level only — no route, no server wiring.
//            - δ-1: G6.3 deferred; domain is READ from the established
//              wallet_type, not a routing decision.
//            - ε-1: no new audit literals — the wrapped assembleContext
//              emits COE_ASSEMBLE_CONTEXT; this layer returns audit_intent
//              metadata only.
//            - ζ-1: typed degraded/missing-context metadata in the result.
//            - η-1: one high-level composing call (no chatty primitives).
//            - θ-1: no new cache; PERS.2 per-field TTL/freshness rides in
//              the response.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/permission-envelope.service.ts
//     (resolvePermissionEnvelope — the 4-tier permission envelope)
//   - apps/api/src/services/personalization/moment-context.service.ts
//     (resolveMomentContext — the permissioned moment slice)
//   - apps/api/src/services/personalization/temporal-personalization.ts
//     (PermissionTier + TemporalClass vocabulary, via the resolvers)
//   - apps/api/src/services/coe/coe.service.ts (assembleContext — the
//     governed capsule-retrieval path this orchestrator wraps; consumed
//     via the ContextAssembler injection seam, type-only import)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Hybrid API Strategy buildPersonalizedWorkingSet; Q-PERS.3)
//
// Composition is deterministic given its inputs + injected dependencies:
// the two PERS.2 resolvers are pure; `now` is injected; this service does
// NO raw DB access (the injected SessionContextResolver owns the
// authoritative session→wallet lookup), NO external provider calls, NO
// route, NO server wiring, NO COE/COSMP mutation.

import {
  resolvePermissionEnvelope,
  type ContextDomain,
  type EnterpriseEnvelopeDefaults,
  type EnvelopeReason,
  type PermissionEnvelope,
  type ScopedGrant,
} from "./permission-envelope.service.js";
import {
  resolveMomentContext,
  type MomentCallerInputs,
  type MomentContextEnvelope,
} from "./moment-context.service.js";
import type { PermissionTier, TemporalClass } from "./temporal-personalization.js";
import {
  buildDegradedContract,
  CONSUMER_OBLIGATIONS,
  type DegradedContractEntry,
} from "./degraded-mode-contract.js";
import type {
  AssembleContextFailure,
  AssembleContextSuccess,
  ContextItem,
} from "../coe/coe.service.js";
import type { EntityType, WalletType } from "@niov/database";

// WHAT: The failure-code union for the orchestrator. Kept in lockstep
//        with the wrapped COE assembleContext failure codes so the HTTP
//        layer (PERS.4) maps one vocabulary.
// WHY: The session/wallet gate + the wrapped COE path fail with the same
//      code space; a single union keeps the contract coherent.
export type WorkingSetFailureCode = AssembleContextFailure["code"];

// WHAT: Authoritative session→context resolution success. The Foundation
//        owns this determination (an app cannot assert its own domain).
// WHY: domain (personal vs enterprise) is derived from the established
//      wallet_type per Q-PERS.3-δ; entity_type feeds the permission
//      envelope; timezone feeds the moment context.
export interface SessionContextSuccess {
  readonly ok: true;
  readonly entity_id: string;
  readonly wallet_id: string;
  readonly wallet_type: WalletType;
  readonly entity_type: EntityType;
  readonly timezone: string | null;
}

// WHAT: Authoritative session→context resolution failure.
// WHY: An invalid/expired session or a missing wallet must fail closed
//      with NO personalization leakage.
export interface SessionContextFailure {
  readonly ok: false;
  readonly code: WorkingSetFailureCode;
  readonly message: string;
}

// WHAT: The injected authoritative session→context resolver. Production
//        (wired at PERS.4) validates the session token and resolves the
//        wallet + entity + profile timezone; tests inject a fake.
// WHY: Keeps this orchestrator free of raw DB access at PERS.3 while
//      preserving Foundation-authoritative domain determination.
export interface SessionContextResolver {
  resolve(
    sessionToken: string,
  ): Promise<SessionContextSuccess | SessionContextFailure>;
}

// WHAT: The injected governed capsule-retrieval seam. The live COEService
//        satisfies this structurally; tests inject a stub.
// WHY: β-1 — WRAP assembleContext rather than mutate COE. The structural
//      interface lets unit tests compose without constructing a real COE.
export interface ContextAssembler {
  assembleContext(
    sessionToken: string,
    requestText: string,
    tokenBudget: number,
    context?: { ip_address?: string | null },
  ): Promise<AssembleContextSuccess | AssembleContextFailure>;
}

// WHAT: Input to buildPersonalizedWorkingSet.
// WHY: One high-level call (η-1). request_text + token_budget feed the
//      COE capsule slice; requested_context + grants + enterprise_defaults
//      feed the permission envelope; caller_inputs + now feed the moment
//      slice. now is injected for determinism.
export interface WorkingSetInput {
  readonly request_text: string;
  readonly token_budget: number;
  readonly requested_context: readonly string[];
  readonly grants?: Readonly<Record<string, ScopedGrant>>;
  readonly enterprise_defaults?: EnterpriseEnvelopeDefaults;
  readonly caller_inputs?: MomentCallerInputs;
  readonly now?: Date;
  readonly ip_address?: string | null;
}

// WHAT: A leak-free summary of one resolved permission-envelope key.
// WHY: The working set exposes which context is available/denied/missing
//      with a machine-readable reason + audit_intent — never the
//      underlying data.
export interface WorkingSetPermissionSummary {
  readonly key: string;
  readonly tier: PermissionTier;
  readonly available: boolean;
  readonly reason: EnvelopeReason;
  readonly temporalClass: TemporalClass;
  readonly audit_intent: string;
}

// WHAT: Assembly counters for the composed working set.
// WHY: Surfaces both the COE capsule stats and the personalization
//      availability counts for observability + the future context-used
//      manifest.
export interface WorkingSetStats {
  readonly capsules_loaded: number;
  readonly tokens_consumed: number;
  readonly capsules_skipped_low_relevance: number;
  readonly capsules_skipped_budget: number;
  readonly capsules_denied_permission: number;
  readonly context_keys_requested: number;
  readonly context_keys_available: number;
  readonly moment_fields_available: number;
}

// WHAT: The governed working set returned on success.
// WHY: The single coherent package the Foundation hands to apps/agents:
//      domain + moment slice + permission summary + governed capsules +
//      stats + the canonical degraded/uncertainty contract + the consumer
//      obligations + audit_intent. Carries only governed capsule content
//      items — never raw retrieval internals. `degraded` is the canonical
//      PERS.4 disclosure (DegradedContractEntry) so consumers cannot misuse
//      withheld/fallback/uncertain context; `consumer_obligations` declares
//      the truth-handling duties (Q-PERS.4-η).
export interface WorkingSetSuccess {
  readonly ok: true;
  readonly domain: ContextDomain;
  readonly moment: MomentContextEnvelope;
  readonly permissions: readonly WorkingSetPermissionSummary[];
  readonly capsules: readonly ContextItem[];
  readonly stats: WorkingSetStats;
  readonly degraded: readonly DegradedContractEntry[];
  readonly consumer_obligations: readonly string[];
  readonly audit_intent: string;
}

// WHAT: The fail-closed failure shape.
// WHY: On session/wallet/COE failure the orchestrator returns ONLY
//      ok/code/message — no moment, no permissions, no capsules — so a
//      denied request can never leak personalization.
export interface WorkingSetFailure {
  readonly ok: false;
  readonly code: WorkingSetFailureCode;
  readonly message: string;
}

// WHAT: Map a WalletType to the binary personalization domain.
// INPUT: The established wallet_type.
// OUTPUT: "enterprise" for ENTERPRISE wallets; "personal" otherwise.
// WHY: Q-PERS.3-δ — the domain is READ from the established wallet_type
//      (DEVICE + PERSONAL + any non-enterprise wallet → personal). This is
//      not an AI_AGENT routing decision (G6.3 remains deferred).
function domainForWalletType(walletType: WalletType): ContextDomain {
  return walletType === "ENTERPRISE" ? "enterprise" : "personal";
}

export class WorkingSetService {
  constructor(
    private readonly sessionContextResolver: SessionContextResolver,
    private readonly contextAssembler: ContextAssembler,
  ) {}

  // WHAT: Build the governed personalized working set in one call.
  // INPUT: A session token + the WorkingSetInput.
  // OUTPUT: WorkingSetSuccess (governed working set) or WorkingSetFailure
  //         (fail-closed, no personalization leakage).
  // WHY: PERS.3 — the Foundation composes the proven governed substrate
  //      (authoritative session/wallet resolution → permission envelope →
  //      moment context → governed COE capsule retrieval) so the LLM
  //      consumes a scoped working set it did not get to choose.
  async buildPersonalizedWorkingSet(
    sessionToken: string,
    input: WorkingSetInput,
  ): Promise<WorkingSetSuccess | WorkingSetFailure> {
    if (typeof input.request_text !== "string" || input.token_budget <= 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "request_text and a positive token_budget are required",
      };
    }

    // STEP 1-2 — authoritative session→context resolution. Fail closed:
    // an invalid/expired session or missing wallet returns ONLY the
    // failure (no moment / permissions / capsules leak).
    const ctx = await this.sessionContextResolver.resolve(sessionToken);
    if (!ctx.ok) {
      return { ok: false, code: ctx.code, message: ctx.message };
    }

    // STEP 3 — derive domain authoritatively from the established
    // wallet_type (the app cannot assert its own domain).
    const domain = domainForWalletType(ctx.wallet_type);

    // STEP 4 — resolve the PERS.2 permission envelope (pure). No
    // cross-wallet / cross-context bridging by default.
    const envelope: PermissionEnvelope = resolvePermissionEnvelope({
      actor_entity_id: ctx.entity_id,
      wallet_id: ctx.wallet_id,
      entity_type: ctx.entity_type,
      domain,
      requested_context: input.requested_context,
      grants: input.grants,
      enterprise_defaults: input.enterprise_defaults,
    });

    // STEP 5 — resolve the PERS.2 moment context (pure). `now` is
    // injected; the safe default is only used when the caller omits it.
    const now = input.now ?? new Date();
    const moment = resolveMomentContext({
      now,
      entity_profile_timezone: ctx.timezone,
      permissions: envelope,
      caller_inputs: input.caller_inputs,
    });

    // STEP 6 — WRAP the governed COE capsule-retrieval path. assembleContext
    // re-validates the session, scopes to the wallet, NEGOTIATEs + READs +
    // decrypts, and writes the COE_ASSEMBLE_CONTEXT audit (RULE 4).
    const assembled = await this.contextAssembler.assembleContext(
      sessionToken,
      input.request_text,
      input.token_budget,
      { ip_address: input.ip_address ?? null },
    );

    // STEP 7 — fail closed on a COE failure: return ONLY the failure so a
    // permission-denied retrieval can never leak the personalization slice.
    if (!assembled.ok) {
      return { ok: false, code: assembled.code, message: assembled.message };
    }

    // STEP 8 — compose the governed working set.
    const permissions: WorkingSetPermissionSummary[] = envelope.resolved.map(
      (r) => ({
        key: r.key,
        tier: r.tier,
        available: r.available,
        reason: r.reason,
        temporalClass: r.temporalClass,
        audit_intent: r.audit_intent,
      }),
    );

    // Canonical PERS.4 degraded/uncertainty contract: normalize the
    // permission-envelope, moment-context, timezone-fallback, and the COE
    // aggregate denial count into one leak-free disclosure with per-entry
    // use policy. `stale` is intentionally not emitted (no as-of timestamp
    // at build time) per the Q-PERS.4 blind-spot lock.
    const degraded: DegradedContractEntry[] = buildDegradedContract({
      envelope,
      moment,
      capsules_denied_permission: assembled.capsules_denied_permission,
    });

    const contextKeysAvailable = envelope.resolved.filter(
      (r) => r.available,
    ).length;
    const momentFieldsAvailable = moment.fields.filter(
      (f) => f.available,
    ).length;

    const stats: WorkingSetStats = {
      capsules_loaded: assembled.capsules_loaded,
      tokens_consumed: assembled.tokens_consumed,
      capsules_skipped_low_relevance: assembled.capsules_skipped_low_relevance,
      capsules_skipped_budget: assembled.capsules_skipped_budget,
      capsules_denied_permission: assembled.capsules_denied_permission,
      context_keys_requested: input.requested_context.length,
      context_keys_available: contextKeysAvailable,
      moment_fields_available: momentFieldsAvailable,
    };

    return {
      ok: true,
      domain,
      moment,
      permissions,
      capsules: assembled.context,
      stats,
      degraded,
      consumer_obligations: CONSUMER_OBLIGATIONS,
      audit_intent: `working_set_built:${domain}:capsules=${assembled.capsules_loaded}:ctx_keys=${contextKeysAvailable}/${input.requested_context.length}:degraded=${degraded.length}`,
    };
  }
}
