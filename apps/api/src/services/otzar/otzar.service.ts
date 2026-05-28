// FILE: otzar.service.ts
// PURPOSE: The Otzar conversational service. conductSession runs
//          STEP 0 priming + 8-layer context assembly + P3 token-
//          budget truncation + LLM call. closeConversation writes
//          a CONVERSATION_LEARNING capsule to the EMPLOYEE wallet
//          (portability invariant) and fires the COE recordOutcome
//          hook so Loop 1 (relevance scoring) updates. Auto-close
//          sweep iterates ACTIVE OtzarConversation rows and closes
//          those idle for >30 minutes.
// CONNECTS TO: AuthService (session), COEService (assembleContext +
//              recordOutcome), LLMProvider (generation), KVCache
//              (priming + last_active + first-convo-today flag),
//              prisma (capsule + conversation + metrics rows).

import { randomUUID } from "node:crypto";
import {
  prisma,
  writeAuditEvent,
  type CapsuleType,
} from "@niov/database";
import { logger } from "../../logger.js";
import type { AuthService } from "../auth.service.js";
import type { COEService } from "../coe/coe.service.js";
import type { LLMProvider, LLMResult } from "../llm/llm.service.js";
import type { KVCache } from "./cache.js";
import { getPriming } from "./priming.js";
import {
  truncateToTokenBudget,
  TokenBudgetExceededError,
  type LayerBundle,
} from "./truncation.js";
import {
  projectOtzarTransparency,
  type ChatTransparency,
  type ContextProvenanceItem,
} from "./transparency.js";
import {
  projectConversationDetail,
  type ConversationDetailView,
} from "./conversation-detail.js";
import {
  projectConversationCorrections,
  type ConversationCorrectionsView,
} from "./conversation-corrections.js";

// WHAT: Maximum messages allowed in client-supplied L8 history.
const L8_MAX_MESSAGES = 50;

// WHAT: Section 11B null-role-template fallback. Substituted with
//        twin display_name + owner display_name at build time.
//        Documented as a deliberate fallback so future maintainers
//        know it's intentional (not a bug to "fix" by stripping the
//        template).
const NULL_ROLE_TEMPLATE_FALLBACK =
  "You are {twin_display_name}, a digital twin assistant for {owner_display_name}. " +
  "You exist to extend their working capacity. Defer to your owner on permission " +
  "grants, financial decisions, and any high-stakes external commitments. When " +
  "uncertain, ask before acting.";

// WHAT: How long the Redis flag for "first conversation of the day"
//        survives. Computed dynamically each set: seconds until
//        next 04:00 local. Tests that need to skip the morning
//        brief just pre-populate the flag.
function secondsUntilNext4amLocal(): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(4, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.ceil((target.getTime() - now.getTime()) / 1000);
}

// WHAT: How long Redis caches the "last active" timestamp for an
//        OtzarConversation. Auto-close sweep treats missing OR
//        stale-by-30min as eligible for close.
const LAST_ACTIVE_TTL_SECONDS = 7200;
const AUTO_CLOSE_STALE_THRESHOLD_MS = 30 * 60 * 1000;

// WHAT: Caller-facing input shape for conductSession.
export interface ConductSessionInput {
  token: string;
  message: string;
  conversation_id?: string;
  conversation_history?: string[];
  token_budget?: number;
}

// WHAT: Successful conductSession return.
// ADR-0051 (Wave 1): `transparency` and `context_provenance` are ADDITIVE
// OPTIONAL fields surfacing the governed context metadata COE already
// produced. `ok`, `response`, `context_used`, `tokens_consumed`, and
// `conversation_id` are unchanged (backward-compatible).
export interface ConductSessionSuccess {
  ok: true;
  response: string;
  context_used: number;
  tokens_consumed: number;
  conversation_id: string;
  transparency?: ChatTransparency;
  context_provenance?: ContextProvenanceItem[];
}

// WHAT: Failure shape for conductSession + closeConversation.
export interface OtzarFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "TWIN_NOT_FOUND"
    | "INVALID_HISTORY"
    | "TOKEN_BUDGET_EXCEEDED"
    | "LLM_UNAVAILABLE"
    | "CONVERSATION_NOT_FOUND"
    | "NOT_CONVERSATION_OWNER";
  message: string;
  detail?: unknown;
}

// WHAT: Inputs for closeConversation.
export interface CloseConversationInput {
  token: string;
  conversation_id: string;
  capsule_ids_used?: string[];
  conversation_history?: string[];
}

// WHAT: Successful closeConversation return.
export interface CloseConversationSuccess {
  ok: true;
  capsule_id: string;
  conversation_id: string;
  topics: string[];
}

// WHAT: Inputs for getMyTwin.
export interface GetMyTwinInput {
  token: string;
}

// WHAT: One safe skill-package view for the My Twin contract.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Friendly name + category ONLY. SkillPackage.capability_flags
//      (the raw capability envelope) is NEVER projected to the
//      employee-facing surface.
export interface MyTwinSkillView {
  name: string;
  category: string;
}

// WHAT: The employee's optional approver identity (the human who
//        approves this twin's escalations).
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: entity_id + display_name ONLY -- no org-hierarchy internals.
export interface MyTwinApproverView {
  entity_id: string;
  display_name: string;
}

// ──────────────────────────────────────────────────────────────────
// ADR-0053 Wave 2A: the employee AI Twin role-scope profile.
//
// Every sub-shape below is a SAFE, SELF-SCOPED projection or a calm,
// product-facing label. These types NEVER carry raw permission internals,
// bridge IDs, capability flags, raw clearance values, permission-condition
// JSON, can_share_forward, capsule IDs, storage locations, transcript /
// message content, or any other employee's / cross-tenant data. No
// surveillance / monitoring / productivity-policing framing.
// ──────────────────────────────────────────────────────────────────

// WHAT: Identity block of the role-scope profile (mirrors safe twin fields).
export interface RoleScopeIdentity {
  twin_id: string;
  display_name: string;
  status: string;
}

// WHAT: Role block. Describes the EMPLOYEE's place (job_title / department /
//        hierarchy from the caller's own org membership) plus the twin's
//        role_title + admin flag. Self-scoped to the caller only.
export interface RoleScopeRole {
  role_title: string | null;
  job_title: string | null;
  department: string | null;
  hierarchy_level: number | null;
  is_admin_twin: boolean;
}

// WHAT: Scope summary. Counts + calm posture LABELS derived from the
//        caller's own active memberships. permission_posture /
//        approval_posture are friendly labels — NEVER raw RBAC/ABAC rows,
//        clearance, capability flags, or permission envelopes.
export interface RoleScopeSummary {
  scope_label: string;
  membership_count: number;
  active_membership_count: number;
  department_count: number;
  has_department_scope: boolean;
  has_multiple_memberships: boolean;
  permission_posture: string;
  approval_posture: string;
}

// WHAT: Assistance profile. What the twin is configured to help with.
export interface RoleScopeAssistanceProfile {
  autonomy_mode: string;
  swarm_enabled: boolean;
  role_template_status: "CONFIGURED" | "NOT_CONFIGURED";
  skills_status: "AVAILABLE" | "NOT_CONFIGURED";
  current_assistance_boundaries: string[];
}

// WHAT: Governance block. States the human-in-control posture in fixed,
//        safe literals — sensitive actions require permission/policy/
//        approval; observation is permissioned work context, NOT surveillance.
export interface RoleScopeGovernance {
  approver_configured: boolean;
  approver: MyTwinApproverView | null;
  sensitive_actions_require: "PERMISSION_POLICY_OR_APPROVAL";
  observation_mode: "PERMISSIONED_WORK_CONTEXT_NOT_SURVEILLANCE";
}

// WHAT: Continuity block. SELF-SCOPED COUNTS ONLY (caller's own
//        conversations + own-wallet CORRECTION / CONVERSATION_LEARNING
//        capsules). No raw content, no capsule IDs, no storage locations.
//        Wave 2A uses total self-scoped counts; the `recent_` prefix
//        reserves a future time-window refinement without a contract change.
export interface RoleScopeContinuity {
  recent_conversation_count: number;
  recent_correction_count: number;
  recent_learning_summary_count: number;
  alignment_signals_available: boolean;
}

// WHAT: The full role-scope profile (ADR-0053 Wave 2A). Additive, optional,
//        self-scoped projection attached to MyTwinView.
export interface MyTwinRoleScopeProfile {
  identity: RoleScopeIdentity;
  role: RoleScopeRole;
  scope_summary: RoleScopeSummary;
  assistance_profile: RoleScopeAssistanceProfile;
  governance: RoleScopeGovernance;
  continuity: RoleScopeContinuity;
}

// WHAT: The safe, product-facing projection of the caller's OWN twin.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Identity + alignment fields only. Deliberately EXCLUDES
//      AgentTemplate.template_content (the system prompt),
//      SkillPackage.capability_flags (the raw capability envelope),
//      permission bridge IDs, and any memory / capsule / vector data.
export interface MyTwinView {
  twin_id: string;
  display_name: string;
  role_title: string | null;
  autonomy_mode: string;
  swarm_enabled: boolean;
  role_template: string | null;
  is_admin_twin: boolean;
  status: string;
  skills: MyTwinSkillView[];
  approver: MyTwinApproverView | null;
  created_at: Date;
  updated_at: Date;
  // ADR-0053 Wave 2A: additive, optional, self-scoped role-scope profile.
  // Existing fields above are unchanged (backward-compatible).
  role_scope_profile?: MyTwinRoleScopeProfile;
}

// WHAT: Successful getMyTwin return.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: One deterministic primary twin plus multi-twin metadata so a
//      future UI can expand when an owner has more than one twin.
export interface MyTwinSuccess {
  ok: true;
  twin: MyTwinView;
  has_multiple_twins: boolean;
  twin_count: number;
}

// WHAT: Conversation status filter accepted by listConversations.
export type ConversationStatus = "ACTIVE" | "CLOSED";

// WHAT: Inputs for listConversations.
export interface ListConversationsInput {
  token: string;
  skip: number;
  take: number;
  status?: ConversationStatus;
}

// WHAT: One conversation's metadata-only projection.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Continuity metadata ONLY -- NO transcript, NO message bodies,
//      NO conversation_history, NO capsule references (OtzarConversation
//      stores none of those).
export interface ConversationListItem {
  conversation_id: string;
  twin_id: string;
  source_type: string;
  status: string;
  message_count: number;
  started_at: Date;
  closed_at: Date | null;
}

// WHAT: Successful listConversations return (paginated).
export interface ConversationListSuccess {
  ok: true;
  items: ConversationListItem[];
  total: number;
  has_more: boolean;
}

// WHAT: Inputs for getConversationDetail (ADR-0054 Wave 2B).
export interface GetConversationDetailInput {
  token: string;
  conversation_id: string;
}

// WHAT: Successful getConversationDetail return (single safe look-back).
export interface ConversationDetailSuccess {
  ok: true;
  conversation: ConversationDetailView;
}

// WHAT: Inputs for getConversationCorrections (ADR-0055 Wave 2C).
export interface GetConversationCorrectionsInput {
  token: string;
  conversation_id: string;
}

// WHAT: Successful getConversationCorrections return (per-conversation
//        correction-signal projection — counts + last-seen freshness +
//        anti-overclaim notes). The fields live at the top level (not
//        nested under `corrections`) per ADR-0055 §Decision 5.
export interface ConversationCorrectionsSuccess
  extends ConversationCorrectionsView {
  ok: true;
}

// WHAT: The Otzar service.
// INPUT: AuthService, COEService, LLMProvider, KVCache.
// OUTPUT: A class with conductSession, closeConversation, and
//         runAutoCloseSweep methods.
// WHY: Constructor injection keeps tests cleanly composable -- they
//      can swap in MockLLMProvider + MemoryKVCache without any env
//      coupling.
export class OtzarService {
  constructor(
    private readonly authService: AuthService,
    private readonly coeService: COEService,
    private readonly llmProvider: LLMProvider,
    private readonly cache: KVCache,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // conductSession -- the 8-layer assembly + truncation + LLM call.
  //
  // MONETIZATION DESIGN NOTE (Section 11): conductSession reads many
  // capsules during 8-layer assembly via coeService. These internal
  // reads do NOT fire monetization events. Monetization fires only at
  // user-driven HTTP boundaries (e.g., POST /cosmp/read at the route
  // level). The user-facing event here is "user sent a message"; the
  // internal context retrieval is implementation detail. A future
  // section may introduce per-agent-action monetization at a different
  // granularity for autonomous agent activity, but that is out of
  // scope for the user-driven conductSession path.
  // ──────────────────────────────────────────────────────────────
  async conductSession(
    input: ConductSessionInput,
  ): Promise<ConductSessionSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Otzar denied" };
    }
    const ownerEntityId = session.entity_id;

    // Resolve owner's twin (AI_AGENT child via EntityMembership).
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: ownerEntityId, is_active: true },
      select: { child_id: true },
    });
    const childIds = memberships.map((m) => m.child_id);
    // Deterministic primary-twin selection: oldest active twin by
    // created_at ASC, entity_id ASC tie-break. getMyTwin uses the
    // IDENTICAL orderBy so the twin a user SEES (/otzar/my-twin) is the
    // same twin they TALK TO here (QLOCK D-OTZ-2 alignment). Behavior is
    // otherwise unchanged -- we still take twins[0].
    const twins = await prisma.entity.findMany({
      where: {
        entity_id: { in: childIds },
        entity_type: "AI_AGENT",
        deleted_at: null,
      },
      orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
    });
    const twin = twins[0];
    if (twin === undefined) {
      return {
        ok: false,
        code: "TWIN_NOT_FOUND",
        message: "Caller has no digital twin",
      };
    }
    const twinConfig = await prisma.twinConfig.findUnique({
      where: { twin_id: twin.entity_id },
    });
    const owner = await prisma.entity.findUnique({
      where: { entity_id: ownerEntityId },
    });
    const ownerDisplayName = owner?.display_name ?? "Owner";
    const twinDisplayName = twin.display_name ?? "Twin";

    // Resolve org for priming. Tolerant -- orgless callers get null.
    const { getOrgEntityId } = await import("../governance/org.js");
    let orgEntityId: string | null;
    try {
      orgEntityId = await getOrgEntityId(ownerEntityId);
    } catch {
      orgEntityId = null;
    }

    const callerRole =
      memberships.length > 0
        ? "employee"
        : "individual";
    const tokenBudget = input.token_budget ?? 8000;

    // Validate L8 history length up front.
    const history = input.conversation_history ?? [];
    if (history.length > L8_MAX_MESSAGES) {
      return {
        ok: false,
        code: "INVALID_HISTORY",
        message: `conversation_history capped at ${L8_MAX_MESSAGES} messages`,
      };
    }

    // STEP 0 -- priming.
    const priming = await getPriming({
      ownerEntityId,
      orgEntityId,
      callerRole,
      message: input.message,
      cache: this.cache,
    });

    // Look up the caller's wallet for layer queries.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    const ownerWalletId = ownerWallet?.wallet_id ?? null;

    // LAYER 1 -- CORRECTION capsules (NEVER TRIM).
    const l1Caps =
      ownerWalletId === null
        ? []
        : await prisma.memoryCapsule.findMany({
            where: {
              wallet_id: ownerWalletId,
              capsule_type: "CORRECTION",
              deleted_at: null,
            },
            take: 50,
            select: { payload_summary: true },
          });
    const L1 =
      l1Caps.length > 0
        ? "[CORRECTIONS]\n" + l1Caps.map((c) => c.payload_summary).join("\n")
        : "";

    // LAYER 2 -- role template (or null-template fallback).
    let L2: string;
    if (typeof twinConfig?.role_template === "string") {
      const tpl = await prisma.agentTemplate.findUnique({
        where: { role_name: twinConfig.role_template },
      });
      L2 =
        tpl?.template_content ??
        NULL_ROLE_TEMPLATE_FALLBACK.replace(
          "{twin_display_name}",
          twinDisplayName,
        ).replace("{owner_display_name}", ownerDisplayName);
    } else {
      L2 = NULL_ROLE_TEMPLATE_FALLBACK.replace(
        "{twin_display_name}",
        twinDisplayName,
      ).replace("{owner_display_name}", ownerDisplayName);
    }

    // LAYER 3 -- WORK_PATTERN / COMMUNICATION_PREF / DECISION_STYLE.
    const l3Caps =
      ownerWalletId === null
        ? []
        : await prisma.memoryCapsule.findMany({
            where: {
              wallet_id: ownerWalletId,
              capsule_type: {
                in: [
                  "WORK_PATTERN",
                  "COMMUNICATION_PREF",
                  "DECISION_STYLE",
                ] as CapsuleType[],
              },
              deleted_at: null,
            },
            orderBy: { relevance_score: "desc" },
            take: 5,
            select: { payload_summary: true },
          });
    const L3 =
      l3Caps.length > 0
        ? "[WORK PROFILE]\n" + l3Caps.map((c) => c.payload_summary).join("\n")
        : "";

    // LAYERS 4 + 5 via single COE call, partitioned by capsule_type.
    const coe = await this.coeService.assembleContext(
      input.token,
      input.message,
      tokenBudget,
    );
    let L4 = "";
    let L5_items: { content: string; relevance_score: number }[] = [];
    if (coe.ok) {
      const foundational = coe.context.filter(
        (c) => c.capsule_type === "FOUNDATIONAL",
      );
      const others = coe.context.filter(
        (c) => c.capsule_type !== "FOUNDATIONAL",
      );
      L4 =
        foundational.length > 0
          ? "[FOUNDATIONAL]\n" + foundational.map((c) => c.content).join("\n")
          : "";
      // L5 items keep relevance_score for truncation ordering.
      // ContextItem doesn't carry relevance_score in its shape; for
      // 11B we approximate with the position in the COE-returned
      // list (earlier items have higher COE-computed relevance).
      L5_items = others.map((c, idx) => ({
        content: c.content,
        relevance_score: 1 - idx * 0.01,
      }));
    }

    // LAYER 6 -- TaskQueue (stub: no table yet, returns []).
    // TODO(Section 14 admin tooling): query TaskQueue where
    // assignee_id = twin.entity_id AND status IN ('OPEN',
    // 'IN_PROGRESS') AND priority >= 5, order by priority desc,
    // limit 5. L6 stays an identity layer (NEVER TRIM) so the
    // architectural slot is preserved.
    const L6 = "";

    // LAYER 7 -- morning brief gated by Redis flag.
    const briefFlagKey = `otzar:entity:${ownerEntityId}:first_convo_today`;
    const briefFlag = await this.cache.get(briefFlagKey);
    let L7 = "";
    if (briefFlag === null) {
      L7 = `[TODAY'S BRIEF]\nGood morning, ${ownerDisplayName}. You have ${l1Caps.length} active corrections to keep in mind and ${l3Caps.length} work-profile signals loaded.`;
      await this.cache.set(
        briefFlagKey,
        "1",
        secondsUntilNext4amLocal(),
      );
    }

    // LAYER 8 -- conversation_history from client.
    const L8_items = [...history];

    // P3 truncation. Tokenizer used at write time was anthropic;
    // we use the same tokenizer here for consistency. Lazy import
    // to avoid WASM load in tests that don't reach this path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { countTokens } = require("@anthropic-ai/tokenizer") as {
      countTokens: (text: string) => number;
    };

    const bundle: LayerBundle = {
      priming: priming.text,
      L1,
      L2,
      L3,
      L4,
      L5_items,
      L6,
      L7,
      L8_items,
    };

    let truncated;
    try {
      truncated = truncateToTokenBudget({
        bundle,
        budget: tokenBudget,
        countTokens,
      });
    } catch (err) {
      if (err instanceof TokenBudgetExceededError) {
        return {
          ok: false,
          code: "TOKEN_BUDGET_EXCEEDED",
          message: "Token budget exceeded after exhausting trimmable layers",
          detail: err.detail,
        };
      }
      throw err;
    }

    // Build the final system prompt + user message.
    const systemPrompt = [
      truncated.final.priming,
      truncated.final.L1,
      truncated.final.L2,
      truncated.final.L3,
      truncated.final.L4,
      truncated.final.L5_items.map((i) => i.content).join("\n"),
      truncated.final.L6,
      truncated.final.L7,
    ]
      .filter((s) => s.length > 0)
      .join("\n\n");
    const userPrompt =
      truncated.final.L8_items.length > 0
        ? truncated.final.L8_items.join("\n") + "\n\n" + input.message
        : input.message;

    const llmResult: LLMResult = await this.llmProvider.generateResponse({
      system: systemPrompt,
      user: userPrompt,
    });
    if (!llmResult.ok) {
      return {
        ok: false,
        code: "LLM_UNAVAILABLE",
        message: llmResult.fallback_message,
      };
    }

    // Persist conversation row (create or update).
    let conversationId: string;
    if (
      typeof input.conversation_id === "string" &&
      input.conversation_id.length > 0
    ) {
      conversationId = input.conversation_id;
      await prisma.otzarConversation.update({
        where: { conversation_id: conversationId },
        data: { message_count: { increment: 1 } },
      });
    } else {
      conversationId = randomUUID();
      await prisma.otzarConversation.create({
        data: {
          conversation_id: conversationId,
          entity_id: ownerEntityId,
          twin_id: twin.entity_id,
          source_type: "CHAT",
          participants: [ownerEntityId, twin.entity_id],
          message_count: 1,
          status: "ACTIVE",
        },
      });
      // Section 11D TP9 -- emit CONVERSATION_STARTED audit ONLY on
      // new-conversation creation. Continued messages of an existing
      // conversation rely on the COE-internal CAPSULE_CONTENT_READ
      // audits already wired by readService for per-read traceability.
      await writeAuditEvent({
        event_type: "CONVERSATION_STARTED",
        outcome: "SUCCESS",
        actor_entity_id: ownerEntityId,
        target_entity_id: ownerEntityId,
        details: {
          conversation_id: conversationId,
          twin_id: twin.entity_id,
        },
      });
    }
    // Refresh last_active so the auto-close sweep keeps this
    // conversation marked as ACTIVE for another 30 minutes.
    await this.cache.set(
      `otzar:conv:${conversationId}:last_active`,
      String(Date.now()),
      LAST_ACTIVE_TTL_SECONDS,
    );

    const contextUsed =
      l1Caps.length +
      l3Caps.length +
      (L4.length > 0 ? 1 : 0) +
      truncated.final.L5_items.length;

    // ADR-0051 Wave 1: additive transparency projection. Pure mapping of
    // the `coe` metadata already computed above (and the existing
    // context_used count) -- no new retrieval, no scoring change, no COE
    // re-call. The mapper never serializes raw content or the raw
    // denied-permission count.
    const { transparency, context_provenance } = projectOtzarTransparency({
      coe,
      context_items_used: contextUsed,
    });

    return {
      ok: true,
      response: llmResult.text,
      context_used: contextUsed,
      tokens_consumed: truncated.total_tokens,
      conversation_id: conversationId,
      transparency,
      context_provenance,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // closeConversation -- PORTABILITY: writes CONVERSATION_LEARNING
  // capsule to EMPLOYEE wallet (NOT org wallet). Fires Loop 1 hook
  // via coeService.recordOutcome. Invalidates priming cache.
  // ──────────────────────────────────────────────────────────────
  async closeConversation(
    input: CloseConversationInput,
  ): Promise<CloseConversationSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Otzar close denied" };
    }
    const ownerEntityId = session.entity_id;

    const conv = await prisma.otzarConversation.findUnique({
      where: { conversation_id: input.conversation_id },
    });
    if (conv === null) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      };
    }
    if (conv.entity_id !== ownerEntityId) {
      return {
        ok: false,
        code: "NOT_CONVERSATION_OWNER",
        message: "Caller does not own this conversation",
      };
    }

    // Topic extraction. Degraded path (auto-close) skips LLM call
    // and uses a generic topic. Otherwise prompt the LLM, parse,
    // fall back to "conversation_summary" on any malformed shape.
    const topics = await this.extractTopics(input.conversation_history);

    // PORTABILITY: write CONVERSATION_LEARNING capsule to the
    // EMPLOYEE wallet, never the org wallet. Section 15 P4
    // offboarding will preserve this -- the employee's
    // CONVERSATION_LEARNING capsules travel with them.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    if (ownerWallet === null) {
      return {
        ok: false,
        code: "TWIN_NOT_FOUND",
        message: "Caller has no wallet",
      };
    }
    const newCapsuleId = randomUUID();
    const summary = `Conversation ${input.conversation_id} closed; topics: ${topics.join(", ")}`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { countTokens } = require("@anthropic-ai/tokenizer") as {
      countTokens: (text: string) => number;
    };
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: newCapsuleId,
        wallet_id: ownerWallet.wallet_id,
        entity_id: ownerEntityId, // EMPLOYEE -- portability invariant
        version: 1,
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: topics,
        decay_type: "TIME_BASED",
        payload_summary: summary,
        payload_size_tokens: Math.ceil(summary.length / 4),
        tokens: countTokens(summary),
        tokens_tokenizer: "anthropic",
        storage_location: `niov://otzar/conv/${input.conversation_id}/${newCapsuleId}`,
        content_hash: `sha256:placeholder-${newCapsuleId}`,
        created_by: ownerEntityId,
      },
    });

    // Fire Loop 1 hook via coeService.recordOutcome (Section 10
    // wiring already in place via buildApp's COEFeedbackHook).
    const used = input.capsule_ids_used ?? [];
    if (used.length > 0) {
      await this.coeService.recordOutcome(input.token, null, used, true);
    }

    // Flip conversation status.
    await prisma.otzarConversation.update({
      where: { conversation_id: input.conversation_id },
      // ADR-0054 Wave 2B: link the conversation to the
      // CONVERSATION_LEARNING summary capsule written above (additive;
      // the canonical conversation->summary link for look-back detail).
      data: {
        status: "CLOSED",
        closed_at: new Date(),
        summary_capsule_id: newCapsuleId,
      },
    });

    // Increment latest CompoundingMetrics.capsule_count for the org.
    try {
      const { getOrgEntityId } = await import("../governance/org.js");
      const orgEntityId = await getOrgEntityId(ownerEntityId);
      const latestMetric = await prisma.compoundingMetrics.findFirst({
        where: { org_entity_id: orgEntityId },
        orderBy: { measured_at: "desc" },
      });
      if (latestMetric !== null) {
        await prisma.compoundingMetrics.update({
          where: { metric_id: latestMetric.metric_id },
          data: { capsule_count: { increment: 1 } },
        });
      }
    } catch {
      // Orgless caller -- nothing to update. Silent.
    }

    // Invalidate priming cache so the next conversation sees fresh
    // data.
    await this.cache.delete(`otzar:prime:${ownerEntityId}`);
    // Clear last_active so the auto-close sweep doesn't reprocess.
    await this.cache.delete(`otzar:conv:${input.conversation_id}:last_active`);

    // Section 11D TP9 -- emit CONVERSATION_CLOSED audit event with
    // hash-chained trail. Carries the conversation_id, the
    // CONVERSATION_LEARNING capsule_id we just wrote, and the
    // capsule_ids_used the caller passed in (for downstream Loop 1
    // attribution analysis if needed).
    await writeAuditEvent({
      event_type: "CONVERSATION_CLOSED",
      outcome: "SUCCESS",
      actor_entity_id: ownerEntityId,
      target_entity_id: ownerEntityId,
      details: {
        conversation_id: input.conversation_id,
        capsule_id: newCapsuleId,
        capsule_ids_used: used,
      },
    });

    return {
      ok: true,
      capsule_id: newCapsuleId,
      conversation_id: input.conversation_id,
      topics,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // getMyTwin -- the employee's own aligned-twin identity.
  //
  // WHAT: Resolve + return the caller's OWN primary digital twin.
  // INPUT: GetMyTwinInput { token }.
  // OUTPUT: MyTwinSuccess (200) or OtzarFailure (SESSION_* / TWIN_NOT_FOUND).
  // WHY: Self-read; "read" capability only (no admin gate, no org
  //      scope -- the twin is the caller's own AI_AGENT child). Resolves
  //      the SAME primary twin conductSession talks to (oldest active by
  //      created_at ASC, entity_id ASC tie-break) so the twin a user
  //      SEES equals the twin they TALK TO. Returns identity + alignment
  //      fields ONLY -- never the role-template body
  //      (AgentTemplate.template_content), capability flags, permission
  //      bridge IDs, or any memory / capsule / vector data. When the
  //      owner has more than one twin we do NOT error: we return the
  //      primary twin plus has_multiple_twins + twin_count.
  // ──────────────────────────────────────────────────────────────
  async getMyTwin(
    input: GetMyTwinInput,
  ): Promise<MyTwinSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "My Twin denied" };
    }
    const ownerEntityId = session.entity_id;

    // Active memberships of the caller. role_title travels with the
    // membership row; twin identity travels with the child entity.
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: ownerEntityId, is_active: true },
      select: { child_id: true, role_title: true },
    });
    const childIds = memberships.map((m) => m.child_id);
    // IDENTICAL orderBy to conductSession (QLOCK D-OTZ-2 alignment) so
    // the seen twin == the talked-to twin.
    const twins = await prisma.entity.findMany({
      where: {
        entity_id: { in: childIds },
        entity_type: "AI_AGENT",
        deleted_at: null,
      },
      orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
    });
    const primary = twins[0];
    if (primary === undefined) {
      return {
        ok: false,
        code: "TWIN_NOT_FOUND",
        message: "Caller has no digital twin",
      };
    }

    const config = await prisma.twinConfig.findUnique({
      where: { twin_id: primary.entity_id },
    });

    // Friendly skill name + category ONLY. capability_flags is NOT
    // selected -- the raw capability envelope stays server-side.
    const twinSkills = await prisma.twinSkill.findMany({
      where: { twin_id: primary.entity_id },
      include: { package: { select: { name: true, category: true } } },
      orderBy: { assigned_at: "asc" },
    });
    const skills: MyTwinSkillView[] = twinSkills.map((s) => ({
      name: s.package.name,
      category: s.package.category,
    }));

    // Approver identity (the human who approves this twin's
    // escalations): entity_id + display_name ONLY, and only when set +
    // still live.
    let approver: MyTwinApproverView | null = null;
    if (config?.approver_entity_id != null) {
      const approverEntity = await prisma.entity.findFirst({
        where: { entity_id: config.approver_entity_id, deleted_at: null },
        select: { entity_id: true, display_name: true },
      });
      if (approverEntity !== null) {
        approver = {
          entity_id: approverEntity.entity_id,
          display_name: approverEntity.display_name,
        };
      }
    }

    const roleTitle =
      memberships.find((m) => m.child_id === primary.entity_id)?.role_title ??
      null;

    // ── ADR-0053 Wave 2A: safe, self-scoped role-scope profile ──
    // Derived ONLY from the caller's own substrate. NEVER exposes raw
    // permission internals, bridge IDs, capability flags, clearance
    // values, permission-condition JSON, can_share_forward, transcript /
    // message content, capsule IDs, or storage locations. No surveillance
    // framing. derive-first per ADR-0053 (no new models/migrations).

    // The HUMAN owner's OWN org memberships (owner as the CHILD of an org /
    // parent). role_title / department / hierarchy here describe the
    // human's place in the org — distinct from the twin's "Digital Twin"
    // role (which is the parent=owner -> child=twin membership above).
    const ownerMemberships = await prisma.entityMembership.findMany({
      where: { child_id: ownerEntityId },
      select: {
        is_active: true,
        department: true,
        hierarchy_level: true,
        is_admin: true,
      },
      orderBy: { created_at: "asc" },
    });
    const activeOwnerMemberships = ownerMemberships.filter((m) => m.is_active);
    const ownerDepartments = Array.from(
      new Set(
        activeOwnerMemberships
          .map((m) => m.department)
          .filter((d): d is string => typeof d === "string" && d.length > 0),
      ),
    );
    const ownerIsOrgAdmin = activeOwnerMemberships.some((m) => m.is_admin);
    const primaryOwnerMembership = activeOwnerMemberships[0] ?? null;

    const ownerProfile = await prisma.entityProfile.findUnique({
      where: { entity_id: ownerEntityId },
      select: { job_title: true },
    });

    // Self-scoped continuity COUNTS only (no content, no IDs, no storage
    // locations). Wave 2A uses total self-scoped counts; the `recent_`
    // prefix reserves a future time-window without a contract change.
    const profileWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    const [
      recentConversationCount,
      recentCorrectionCount,
      recentLearningCount,
    ] = await Promise.all([
      prisma.otzarConversation.count({ where: { entity_id: ownerEntityId } }),
      profileWallet === null
        ? Promise.resolve(0)
        : prisma.memoryCapsule.count({
            where: {
              wallet_id: profileWallet.wallet_id,
              capsule_type: "CORRECTION",
              deleted_at: null,
            },
          }),
      profileWallet === null
        ? Promise.resolve(0)
        : prisma.memoryCapsule.count({
            where: {
              wallet_id: profileWallet.wallet_id,
              capsule_type: "CONVERSATION_LEARNING",
              deleted_at: null,
            },
          }),
    ]);

    const scopeLabel = ownerIsOrgAdmin
      ? "Organization-admin scoped context"
      : activeOwnerMemberships.length > 0
        ? "Role-scoped enterprise context"
        : "Personal work scope";

    const roleScopeProfile: MyTwinRoleScopeProfile = {
      identity: {
        twin_id: primary.entity_id,
        display_name: primary.display_name,
        status: primary.status,
      },
      role: {
        role_title: roleTitle,
        job_title: ownerProfile?.job_title ?? null,
        department: primaryOwnerMembership?.department ?? null,
        hierarchy_level: primaryOwnerMembership?.hierarchy_level ?? null,
        is_admin_twin: config?.is_admin_twin ?? false,
      },
      scope_summary: {
        scope_label: scopeLabel,
        membership_count: ownerMemberships.length,
        active_membership_count: activeOwnerMemberships.length,
        department_count: ownerDepartments.length,
        has_department_scope: ownerDepartments.length > 0,
        has_multiple_memberships: activeOwnerMemberships.length > 1,
        permission_posture:
          activeOwnerMemberships.length > 0
            ? "Governed by role and organization access rules"
            : "Personal work scope only",
        approval_posture:
          approver !== null
            ? "Approval required for sensitive actions"
            : "No approver configured",
      },
      assistance_profile: {
        autonomy_mode: config?.autonomy_level ?? "APPROVAL_REQUIRED",
        swarm_enabled: config?.swarm_enabled ?? false,
        role_template_status:
          typeof config?.role_template === "string" &&
          config.role_template.length > 0
            ? "CONFIGURED"
            : "NOT_CONFIGURED",
        skills_status: skills.length > 0 ? "AVAILABLE" : "NOT_CONFIGURED",
        current_assistance_boundaries: [
          "Operates within your role and organization access scope",
          "Sensitive actions require permission, policy, or approval",
          "Observes permissioned work context to reduce drift and keep your work aligned",
        ],
      },
      governance: {
        approver_configured: approver !== null,
        approver,
        sensitive_actions_require: "PERMISSION_POLICY_OR_APPROVAL",
        observation_mode: "PERMISSIONED_WORK_CONTEXT_NOT_SURVEILLANCE",
      },
      continuity: {
        recent_conversation_count: recentConversationCount,
        recent_correction_count: recentCorrectionCount,
        recent_learning_summary_count: recentLearningCount,
        alignment_signals_available:
          recentCorrectionCount > 0 || recentLearningCount > 0,
      },
    };

    const twin: MyTwinView = {
      twin_id: primary.entity_id,
      display_name: primary.display_name,
      role_title: roleTitle,
      autonomy_mode: config?.autonomy_level ?? "APPROVAL_REQUIRED",
      swarm_enabled: config?.swarm_enabled ?? false,
      role_template: config?.role_template ?? null,
      is_admin_twin: config?.is_admin_twin ?? false,
      status: primary.status,
      skills,
      approver,
      created_at: primary.created_at,
      updated_at: config?.updated_at ?? primary.updated_at,
      role_scope_profile: roleScopeProfile,
    };

    return {
      ok: true,
      twin,
      has_multiple_twins: twins.length > 1,
      twin_count: twins.length,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // listConversations -- metadata-only continuity feed.
  //
  // WHAT: List the caller's OWN OtzarConversation rows, metadata only.
  // INPUT: ListConversationsInput { token, skip, take, status? }.
  // OUTPUT: ConversationListSuccess (200) or OtzarFailure (SESSION_*).
  // WHY: Self-scoped (entity_id === caller; no admin gate, no org
  //      scope). Returns conversation metadata ONLY -- NO transcript, NO
  //      message bodies, NO conversation_history, NO capsule references
  //      (OtzarConversation persists none of those). Newest first,
  //      paginated (skip / take / has_more), optional ACTIVE/CLOSED
  //      status filter. An empty result is a SUCCESS with items: [].
  // ──────────────────────────────────────────────────────────────
  async listConversations(
    input: ListConversationsInput,
  ): Promise<ConversationListSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Conversations denied" };
    }
    const ownerEntityId = session.entity_id;

    // Self-scope: caller's own conversations only. Status filter (when
    // supplied) is composed AS AND with the entity_id predicate -- it
    // never broadens scope.
    const where = {
      entity_id: ownerEntityId,
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.otzarConversation.findMany({
        where,
        orderBy: { started_at: "desc" },
        skip: input.skip,
        take: input.take,
        // Metadata-only projection. Deliberately omits `participants`
        // and never touches message/transcript content (none stored).
        select: {
          conversation_id: true,
          twin_id: true,
          source_type: true,
          status: true,
          message_count: true,
          started_at: true,
          closed_at: true,
        },
      }),
      prisma.otzarConversation.count({ where }),
    ]);

    return {
      ok: true,
      items,
      total,
      has_more: input.skip + input.take < total,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // getConversationDetail -- safe, self-scoped conversation look-back.
  //
  // WHAT: Return one of the caller's OWN conversations as a safe detail
  //        view (metadata + close summary + topics).
  // INPUT: GetConversationDetailInput { token, conversation_id }.
  // OUTPUT: ConversationDetailSuccess (200) or OtzarFailure
  //         (SESSION_* / CONVERSATION_NOT_FOUND / NOT_CONVERSATION_OWNER).
  // WHY: ADR-0054 Wave 2B. Self-scoped (entity_id === caller; no admin
  //      gate, no cross-tenant). The summary is resolved ONLY via the
  //      explicit summary_capsule_id link (no storage_location parsing),
  //      and only the capsule's payload_summary + topic_tags are read --
  //      NEVER content / storage_location / vectors. transparency /
  //      corrections / per-conversation continuity are NOT fabricated
  //      (ADR-0051 transparency is response-only and not persisted). No
  //      transcripts. Read-only projection -- no new audit literal.
  // ──────────────────────────────────────────────────────────────
  async getConversationDetail(
    input: GetConversationDetailInput,
  ): Promise<ConversationDetailSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Conversation detail denied",
      };
    }
    const ownerEntityId = session.entity_id;

    const conv = await prisma.otzarConversation.findUnique({
      where: { conversation_id: input.conversation_id },
      select: {
        conversation_id: true,
        entity_id: true,
        twin_id: true,
        source_type: true,
        status: true,
        started_at: true,
        closed_at: true,
        message_count: true,
        summary_capsule_id: true,
      },
    });
    if (conv === null) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      };
    }
    // Self-scope: caller may read only their OWN conversation.
    if (conv.entity_id !== ownerEntityId) {
      return {
        ok: false,
        code: "NOT_CONVERSATION_OWNER",
        message: "Caller does not own this conversation",
      };
    }

    // Resolve the summary capsule ONLY by the explicit summary_capsule_id
    // link (ADR-0054; no storage_location parsing). Safe projection only --
    // never selects content / storage_location / content_hash / vectors.
    let summaryCapsule: { payload_summary: string; topic_tags: string[] } | null =
      null;
    if (conv.summary_capsule_id !== null) {
      const cap = await prisma.memoryCapsule.findFirst({
        where: { capsule_id: conv.summary_capsule_id, deleted_at: null },
        select: { payload_summary: true, topic_tags: true },
      });
      if (cap !== null) {
        summaryCapsule = {
          payload_summary: cap.payload_summary,
          topic_tags: cap.topic_tags,
        };
      }
    }

    const conversation = projectConversationDetail({
      conversation: {
        conversation_id: conv.conversation_id,
        twin_id: conv.twin_id,
        source_type: conv.source_type,
        status: conv.status,
        started_at: conv.started_at,
        closed_at: conv.closed_at,
        message_count: conv.message_count,
        summary_capsule_id: conv.summary_capsule_id,
      },
      summaryCapsule,
    });

    return { ok: true, conversation };
  }

  // ──────────────────────────────────────────────────────────────
  // getConversationCorrections -- safe, self-scoped per-conversation
  // correction-signal projection (ADR-0055 Wave 2C).
  //
  // WHAT: Return the caller's OWN per-conversation correction signal
  //        count + last-seen freshness + anti-overclaim notes.
  // INPUT: GetConversationCorrectionsInput { token, conversation_id }.
  // OUTPUT: ConversationCorrectionsSuccess (200) or OtzarFailure
  //         (SESSION_* / CONVERSATION_NOT_FOUND / NOT_CONVERSATION_OWNER /
  //         OPERATION_NOT_PERMITTED).
  // WHY: ADR-0055 closes ADR-0054's deferred conversation→correction
  //      linkage non-goal. Self-scoped (entity_id === caller; no admin
  //      gate, no cross-tenant). Counts only CORRECTION capsules in the
  //      caller's own wallet linked to this conversation. NEVER selects
  //      payload_summary / payload_content / target_capsule_id /
  //      storage_location / content_hash / vectors. ConversationDetailView
  //      is unchanged. Submitted/available — NOT learned/applied. Read-
  //      only projection — no new audit literal.
  // ──────────────────────────────────────────────────────────────
  async getConversationCorrections(
    input: GetConversationCorrectionsInput,
  ): Promise<ConversationCorrectionsSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Conversation corrections denied",
      };
    }
    const ownerEntityId = session.entity_id;

    // Conversation existence + self-scope BEFORE the count query so we
    // never disclose another caller's correction footprint via the count.
    const conv = await prisma.otzarConversation.findUnique({
      where: { conversation_id: input.conversation_id },
      select: { conversation_id: true, entity_id: true },
    });
    if (conv === null) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      };
    }
    if (conv.entity_id !== ownerEntityId) {
      return {
        ok: false,
        code: "NOT_CONVERSATION_OWNER",
        message: "Caller does not own this conversation",
      };
    }

    // Resolve the caller's wallet so the count is wallet-bound (per
    // ADR-0055 §Decision 5 + §Patent-Implementation Evidence — scoped
    // wallet-bound continuity signal).
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      // Caller authenticated but has no wallet — same shape as a
      // zero-state response (no corrections possible). Honest absence.
      const view = projectConversationCorrections({
        conversation_id: conv.conversation_id,
        corrections_count: 0,
        last_correction_at: null,
      });
      return { ok: true, ...view };
    }

    // ADR-0055 §Decision 5: real Prisma count of CORRECTION capsules in
    // the caller's wallet linked to this conversation; deleted_at IS NULL
    // (RULE 10 soft-delete-aware). The composite
    // @@index([wallet_id, capsule_type, conversation_id]) added at the
    // schema phase supports this query.
    const corrections_count = await prisma.memoryCapsule.count({
      where: {
        wallet_id: wallet.wallet_id,
        capsule_type: "CORRECTION",
        conversation_id: conv.conversation_id,
        deleted_at: null,
      },
    });
    // last_correction_at: created_at of the most-recent linked
    // CORRECTION capsule, or null when count is 0. SAFE projection —
    // select only created_at; never payload_summary / target_capsule_id /
    // storage_location / content_hash.
    let last_correction_at: Date | null = null;
    if (corrections_count > 0) {
      const latest = await prisma.memoryCapsule.findFirst({
        where: {
          wallet_id: wallet.wallet_id,
          capsule_type: "CORRECTION",
          conversation_id: conv.conversation_id,
          deleted_at: null,
        },
        select: { created_at: true },
        orderBy: { created_at: "desc" },
      });
      last_correction_at = latest?.created_at ?? null;
    }

    const view = projectConversationCorrections({
      conversation_id: conv.conversation_id,
      corrections_count,
      last_correction_at,
    });
    return { ok: true, ...view };
  }

  // WHAT: Extract conversation topics via the LLM, with robust
  //        fallbacks.
  // INPUT: Optional history string array.
  // OUTPUT: An array of topic strings; ["conversation_summary"]
  //         on any failure / malformed response.
  // WHY: Auto-close path passes no history -- we shortcut to the
  //      fallback. For the user-driven close path, the LLM might
  //      return malformed shapes; we never throw, just fall back.
  private async extractTopics(history?: string[]): Promise<string[]> {
    const FALLBACK = ["conversation_summary"];
    if (!Array.isArray(history) || history.length === 0) {
      return FALLBACK;
    }
    try {
      const result = await this.llmProvider.generateResponse({
        system:
          "Extract the top 3 topics from this conversation. Respond with exactly: 'topics: a, b, c'.",
        user: history.join("\n"),
      });
      if (!result.ok) return FALLBACK;
      const text = result.text ?? "";
      const match = text.match(/topics:\s*(.+)/i);
      if (match === null) return FALLBACK;
      const items = match[1]!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return items.length > 0 ? items : FALLBACK;
    } catch {
      return FALLBACK;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // runAutoCloseSweep -- iterate ACTIVE conversations, close any
  // whose last_active is missing or > 30 minutes old. Defensive
  // per-row try/catch so one bad row doesn't tank the sweep.
  //
  // FAILURE OBSERVABILITY: per-row failures land in console.warn for
  // 11B. Section 14 may wire structured audit events here when admin
  // tooling is on top of this metric stream.
  // ──────────────────────────────────────────────────────────────
  async runAutoCloseSweep(): Promise<{ closed: number; skipped: number }> {
    const active = await prisma.otzarConversation.findMany({
      where: { status: "ACTIVE" },
      select: {
        conversation_id: true,
        entity_id: true,
      },
    });
    const now = Date.now();
    let closed = 0;
    let skipped = 0;
    for (const conv of active) {
      try {
        const lastActiveStr = await this.cache.get(
          `otzar:conv:${conv.conversation_id}:last_active`,
        );
        const lastActive =
          lastActiveStr === null ? null : Number.parseInt(lastActiveStr, 10);
        const stale =
          lastActive === null ||
          !Number.isFinite(lastActive) ||
          now - lastActive > AUTO_CLOSE_STALE_THRESHOLD_MS;
        if (!stale) {
          skipped++;
          continue;
        }
        // Degraded close: no token (cron context), no history.
        // Manually do what closeConversation does WITHOUT session
        // validation, since cron has no JWT to validate.
        await this.degradedClose(conv.conversation_id, conv.entity_id);
        closed++;
      } catch (err) {
        logger.warn(
          { err, conversation_id: conv.conversation_id },
          "[otzar.autoClose] failed to close conversation",
        );
      }
    }
    return { closed, skipped };
  }

  // WHAT: Degraded close path used by auto-close cron. No session
  //        validation, no LLM topic extraction, no recordOutcome
  //        (cron has no token).
  // INPUT: conversation_id, owner entity_id.
  // OUTPUT: A promise resolving once the row is flipped + capsule
  //         written.
  // WHY: Auto-close runs without a request context. We still
  //      preserve PORTABILITY (capsule lands in employee wallet)
  //      and the status transition; only the LLM topic extraction
  //      and recordOutcome are skipped (those are user-context
  //      operations).
  private async degradedClose(
    conversationId: string,
    ownerEntityId: string,
  ): Promise<void> {
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    if (ownerWallet === null) return;
    const newCapsuleId = randomUUID();
    const summary = `Conversation ${conversationId} auto-closed (idle > 30 min)`;
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: newCapsuleId,
        wallet_id: ownerWallet.wallet_id,
        entity_id: ownerEntityId,
        version: 1,
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: ["auto_closed"],
        decay_type: "TIME_BASED",
        payload_summary: summary,
        payload_size_tokens: Math.ceil(summary.length / 4),
        tokens: 0,
        tokens_tokenizer: "anthropic",
        storage_location: `niov://otzar/conv/${conversationId}/${newCapsuleId}`,
        content_hash: `sha256:auto-${newCapsuleId}`,
        created_by: ownerEntityId,
      },
    });
    await prisma.otzarConversation.update({
      where: { conversation_id: conversationId },
      // ADR-0054 Wave 2B: link the conversation to the
      // CONVERSATION_LEARNING summary capsule written above (additive;
      // the canonical conversation->summary link for look-back detail).
      data: {
        status: "CLOSED",
        closed_at: new Date(),
        summary_capsule_id: newCapsuleId,
      },
    });
    await this.cache.delete(`otzar:conv:${conversationId}:last_active`);
    await this.cache.delete(`otzar:prime:${ownerEntityId}`);
  }
}
