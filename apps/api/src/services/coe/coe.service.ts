// FILE: coe.service.ts
// PURPOSE: The Contextual Orchestration Engine. Given a session and a
//          free-text request, picks the most relevant capsules from
//          the entity's wallet, NEGOTIATEs access in parallel, READs
//          their content (decrypting along the way), and returns a
//          token-budgeted context package.
// CONNECTS TO: AuthService (validates the session), NegotiateService
//              (per-capsule access), ReadService (metadata + content),
//              ContentEncryption (decrypts ciphertext), prisma (loads
//              wallet + capsule metadata), the audit-of-record table
//              and the new coe_outcomes table.

import {
  prisma,
  writeAuditEvent,
  type AccessScope,
  type CapsuleType,
  type DecayType,
} from "@niov/database";
import { type ContentEncryption } from "@niov/auth";
import type { AuthService } from "../auth.service.js";
import type { NegotiateService } from "../cosmp/negotiate.service.js";
import type { ReadService } from "../cosmp/read.service.js";
import {
  combinedScore,
  extractKeywords,
  recencyScore,
  tagOverlapScore,
} from "./keywords.js";

// WHAT: Conservative tokens-per-capsule estimate used to cap the
//        max number of capsules selected for a budget.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Spec says max_capsules = tokenBudget / 200 (rough estimate).
export const TOKENS_PER_CAPSULE_ESTIMATE = 200;

// WHAT: Floor below which non-FOUNDATIONAL capsules are filtered out
//        of regular retrieval.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Spec: "exclude relevance_score < 0.2 (intentional forgetting)".
export const RELEVANCE_FORGET_FLOOR = 0.2;

// WHAT: One entry in the returned context package.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Each loaded capsule carries the fields the consumer needs to
//      reason over the context.
export interface ContextItem {
  capsule_id: string;
  capsule_type: CapsuleType;
  topic_tags: string[];
  content: string;
}

// WHAT: The shape returned from assembleContext on success.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Includes both the loaded items AND counters for what was
//      skipped (low relevance, budget, permission denied) so the
//      caller can report on the assembly process.
export interface AssembleContextSuccess {
  ok: true;
  capsules_loaded: number;
  tokens_consumed: number;
  capsules_skipped_low_relevance: number;
  capsules_skipped_budget: number;
  capsules_denied_permission: number;
  context: ContextItem[];
}

// WHAT: The shape returned from assembleContext on failure.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Discriminated union for the route.
export interface AssembleContextFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "INVALID_REQUEST";
  message: string;
}

// WHAT: One row of explicitRecall results.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Spec: explicitRecall returns metadata only -- the user
//      decides what to load fully afterwards.
export interface RecallItem {
  capsule_id: string;
  capsule_type: CapsuleType;
  topic_tags: string[];
  payload_summary: string;
  relevance_score: number;
  last_updated_at: Date;
  decay_type: DecayType;
}

// WHAT: The shape returned from explicitRecall.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Empty array on no match, explicit failure type for session
//      issues.
export interface RecallSuccess {
  ok: true;
  items: RecallItem[];
}
export interface RecallFailure {
  ok: false;
  code: AssembleContextFailure["code"];
  message: string;
}

// WHAT: The shape returned from recordOutcome.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: One COEOutcome row is written per capsule_id submitted.
export interface RecordOutcomeSuccess {
  ok: true;
  recorded: number;
}
export interface RecordOutcomeFailure {
  ok: false;
  code: AssembleContextFailure["code"];
  message: string;
}

// WHAT: The COE class.
// INPUT: AuthService, NegotiateService, ReadService, ContentEncryption.
// OUTPUT: A class with assembleContext, explicitRecall, recordOutcome.
// WHY: Constructor injection lets tests swap a mock NegotiateService
//      to verify parallel execution without touching real Supabase.
export class COEService {
  constructor(
    private readonly authService: AuthService,
    private readonly negotiateService: NegotiateService,
    private readonly readService: ReadService,
    private readonly encryption: ContentEncryption,
  ) {}

  // WHAT: Run the seven-step assembleContext flow.
  // INPUT: Session token, the user's free-text request, and the
  //        token budget for the returned context.
  // OUTPUT: A context package with the capsules that survived
  //         relevance + budget + permission checks.
  // WHY: Spec's flow verbatim: understand, load metadata, score,
  //      select, negotiate in parallel, read content, return.
  async assembleContext(
    sessionToken: string,
    requestText: string,
    tokenBudget: number,
    context: { ip_address?: string | null } = {},
  ): Promise<AssembleContextSuccess | AssembleContextFailure> {
    if (typeof requestText !== "string" || tokenBudget <= 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "request_text and a positive token_budget are required",
      };
    }

    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Context denied" };
    }

    // STEP 1 -- understand the request
    const keywords = extractKeywords(requestText);
    const maxCapsules = Math.max(
      1,
      Math.floor(tokenBudget / TOKENS_PER_CAPSULE_ESTIMATE),
    );

    // STEP 2 -- load the entity's wallet, then all candidate metadata
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: session.entity_id },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Entity has no wallet",
      };
    }

    const allCandidates = await prisma.memoryCapsule.findMany({
      where: {
        wallet_id: wallet.wallet_id,
        deleted_at: null,
        clearance_required: { lte: session.clearance_ceiling },
      },
      select: {
        capsule_id: true,
        capsule_type: true,
        topic_tags: true,
        relevance_score: true,
        decay_type: true,
        payload_size_tokens: true,
        last_updated_at: true,
        clearance_required: true,
      },
    });

    // Filter 2: drop low-relevance non-foundational capsules.
    let skippedLowRelevance = 0;
    const candidates = allCandidates.filter((c) => {
      if (c.decay_type === "FOUNDATIONAL") return true;
      if (c.relevance_score >= RELEVANCE_FORGET_FLOOR) return true;
      skippedLowRelevance++;
      return false;
    });

    // STEP 3 -- score each candidate
    const now = new Date();
    const scored = candidates.map((c) => ({
      capsule: c,
      score: combinedScore(
        tagOverlapScore(c.topic_tags, keywords),
        c.relevance_score,
        recencyScore(c.last_updated_at, now),
      ),
      isFoundational: c.decay_type === "FOUNDATIONAL",
    }));

    // FOUNDATIONAL capsules first; everything else by score desc.
    const foundationals = scored.filter((s) => s.isFoundational);
    const ordinary = scored
      .filter((s) => !s.isFoundational)
      .sort((a, b) => b.score - a.score);

    // STEP 4 -- select within budget. FOUNDATIONAL never counts
    // toward the budget; ordinary capsules add until budget hit OR
    // max_capsules reached.
    const selected: typeof scored = [...foundationals];
    let runningTokens = 0;
    let skippedBudget = 0;
    for (const s of ordinary) {
      if (selected.length - foundationals.length >= maxCapsules) {
        skippedBudget++;
        continue;
      }
      if (runningTokens + s.capsule.payload_size_tokens > tokenBudget) {
        skippedBudget++;
        continue;
      }
      selected.push(s);
      runningTokens += s.capsule.payload_size_tokens;
    }

    // STEP 5 -- negotiate in parallel for every selected capsule.
    const negotiations = await Promise.all(
      selected.map((s) =>
        this.negotiateService.negotiate(
          sessionToken,
          s.capsule.capsule_id,
          "FULL",
          { ip_address: context.ip_address ?? null },
        ),
      ),
    );

    // Filter to those granted; count denials.
    let deniedPermission = 0;
    const grantedPairs: { selectedIdx: number; declaration_token: string }[] = [];
    for (let i = 0; i < negotiations.length; i++) {
      const n = negotiations[i]!;
      if (n.ok) {
        grantedPairs.push({
          selectedIdx: i,
          declaration_token: n.declaration_token,
        });
      } else {
        deniedPermission++;
      }
    }

    // STEP 6 -- load content for every granted capsule. Each load is
    // metadata + content because readContent requires a fingerprint.
    // Run them in parallel too.
    const loaded = await Promise.all(
      grantedPairs.map(async (g) => {
        const s = selected[g.selectedIdx]!;
        const meta = await this.readService.readMetadata(
          sessionToken,
          s.capsule.capsule_id,
          g.declaration_token,
          { ip_address: context.ip_address ?? null },
        );
        if (!meta.ok) return null;
        const body = await this.readService.readContent(
          sessionToken,
          s.capsule.capsule_id,
          g.declaration_token,
          meta.metadata_fingerprint,
          { ip_address: context.ip_address ?? null },
        );
        if (!body.ok) return null;
        // Content is encrypted ciphertext; COE decrypts before
        // returning so callers get plaintext context items.
        let plain: string;
        try {
          plain = this.encryption.decrypt(body.content);
        } catch {
          // If decryption fails (legacy unencrypted content from
          // older test fixtures), pass through the raw value.
          plain = body.content;
        }
        return {
          capsule_id: s.capsule.capsule_id,
          capsule_type: s.capsule.capsule_type,
          topic_tags: s.capsule.topic_tags,
          content: plain,
        } satisfies ContextItem;
      }),
    );

    const items: ContextItem[] = loaded.filter(
      (i): i is ContextItem => i !== null,
    );

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "COE_ASSEMBLE_CONTEXT",
        keywords,
        token_budget: tokenBudget,
        max_capsules: maxCapsules,
        capsules_considered: candidates.length,
        capsules_loaded: items.length,
        tokens_consumed: runningTokens,
        capsules_skipped_low_relevance: skippedLowRelevance,
        capsules_skipped_budget: skippedBudget,
        capsules_denied_permission: deniedPermission,
      },
    });

    return {
      ok: true,
      capsules_loaded: items.length,
      tokens_consumed: runningTokens,
      capsules_skipped_low_relevance: skippedLowRelevance,
      capsules_skipped_budget: skippedBudget,
      capsules_denied_permission: deniedPermission,
      context: items,
    };
  }

  // WHAT: Search the entity's wallet for capsules whose topic_tags
  //        overlap with a search query. INCLUDES low-relevance
  //        capsules that assembleContext would have filtered out.
  // INPUT: Session token, free-text search query.
  // OUTPUT: List of capsule metadata (no content).
  // WHY: Spec use case: "remember when we discussed X?" -- pulls
  //      capsules back from the dustbin even when their relevance
  //      score has decayed below the forget floor.
  async explicitRecall(
    sessionToken: string,
    searchQuery: string,
    context: { ip_address?: string | null } = {},
  ): Promise<RecallSuccess | RecallFailure> {
    if (typeof searchQuery !== "string" || searchQuery.length === 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "search_query is required",
      };
    }
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Recall denied" };
    }
    const keywords = extractKeywords(searchQuery);
    if (keywords.length === 0) {
      return { ok: true, items: [] };
    }

    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: session.entity_id },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Entity has no wallet",
      };
    }

    // Search by topic_tag overlap. NO relevance_score floor here --
    // explicit recall bypasses the 0.2 forget filter on purpose.
    const rows = await prisma.memoryCapsule.findMany({
      where: {
        wallet_id: wallet.wallet_id,
        deleted_at: null,
        clearance_required: { lte: session.clearance_ceiling },
        topic_tags: { hasSome: keywords },
      },
      select: {
        capsule_id: true,
        capsule_type: true,
        topic_tags: true,
        payload_summary: true,
        relevance_score: true,
        last_updated_at: true,
        decay_type: true,
      },
      orderBy: { last_updated_at: "desc" },
    });

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "COE_EXPLICIT_RECALL",
        keywords,
        result_count: rows.length,
      },
    });

    return { ok: true, items: rows };
  }

  // WHAT: Record one or more "this capsule was used" outcomes.
  // INPUT: Optional session_id, the array of capsule_ids actually
  //        used, a success boolean.
  // OUTPUT: { ok: true, recorded: count } on success.
  // WHY: Section 10's feedback loops will read these rows to nudge
  //      relevance_score up or down. Storing per-capsule rows lets
  //      future analysis aggregate by capsule, by session, or by
  //      window of time.
  async recordOutcome(
    sessionToken: string,
    sessionIdHint: string | null,
    capsuleIdsUsed: string[],
    success: boolean,
    context: { ip_address?: string | null } = {},
  ): Promise<RecordOutcomeSuccess | RecordOutcomeFailure> {
    if (!Array.isArray(capsuleIdsUsed) || typeof success !== "boolean") {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "capsule_ids_used (array) and success (boolean) are required",
      };
    }
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Outcome denied" };
    }
    if (capsuleIdsUsed.length === 0) {
      return { ok: true, recorded: 0 };
    }

    await prisma.cOEOutcome.createMany({
      data: capsuleIdsUsed.map((capsuleId) => ({
        session_id: sessionIdHint ?? session.session_id,
        capsule_id: capsuleId,
        success,
      })),
    });

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "COE_RECORD_OUTCOME",
        success,
        capsule_count: capsuleIdsUsed.length,
        capsule_ids: capsuleIdsUsed,
      },
    });

    return { ok: true, recorded: capsuleIdsUsed.length };
  }
}

// Re-exported so route handlers can keep imports shallow.
export type { AccessScope };
