// FILE: observation.service.ts
// PURPOSE: The Otzar observation pipeline. observe() takes raw
//          conversation/event content and produces structured
//          memory capsules across the right wallets per the
//          PORTABILITY ROUTING invariant: decisions go to the ORG
//          wallet (org property), individual insights + commitments
//          + corrections go to the EMPLOYEE wallet (portable). Plus
//          external entity detection + auto-vocabulary growth so
//          the org's domain intelligence compounds with usage.
// CONNECTS TO: AuthService (session), LLMProvider (extraction +
//              correction-target rendering), prisma (capsule + vocab
//              + external_entity writes), writeAuditEvent (CAPSULE_
//              CREATED audits).

import { createHash, randomUUID } from "node:crypto";
import { CRYPTO_CONFIG } from "@niov/auth";
import {
  prisma,
  writeAuditEvent,
  type CapsuleType,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import type { LLMProvider } from "../llm/llm.service.js";

// WHAT: How many leading characters of content go into the dedup hash.
const DEDUP_CONTENT_PREFIX = 500;
// WHAT: Dedup window. Same hash within this window → skipped.
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
// WHAT: Vocabulary-growth threshold. Term must appear in this many
//        recent capsules to auto-add as ACRONYM.
const VOCAB_GROWTH_THRESHOLD = 3;
const VOCAB_GROWTH_LOOKBACK_DAYS = 30;

// WHAT: Result shapes.
export interface ObserveSuccess {
  ok: true;
  skipped?: false;
  capsule_ids: string[];
  extracted_summary: {
    decisions: number;
    commitments: number;
    work_patterns: number;
    external_entities: number;
    vocab_growth: number;
  };
}
export interface ObserveSkipped {
  ok: true;
  skipped: true;
  reason: "DUPLICATE_CONTENT";
}
export interface ObserveFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "EXTRACTION_FAILED"
    | "ORG_NOT_RESOLVED";
  message: string;
  details?: unknown;
}

export interface ObserveInput {
  token: string;
  content: string;
  event_type: string; // e.g., "MEETING", "MESSAGE", "EMAIL"
  org_entity_id?: string;
}

export interface CorrectionInput {
  token: string;
  incorrect_description: string;
  correct_behavior: string;
  target_capsule_id?: string;
}
export interface CorrectionSuccess {
  ok: true;
  correction_capsule_id: string;
}

export interface AddDomainTermInput {
  token: string;
  term: string;
  term_type: string;
  definition?: string;
  aliases?: string[];
  org_entity_id?: string;
}
export interface AddDomainTermSuccess {
  ok: true;
  vocabulary_id: string;
}

// WHAT: Shape extracted from the LLM. All fields optional so a
//        partial response (the LLM forgot a key) doesn't crash
//        downstream routing.
interface ExtractedIntelligence {
  decisions?: Array<{ topic?: string; outcome?: string }>;
  action_items?: Array<{ description?: string; owner?: string }>;
  commitments?: Array<{
    description?: string;
    due?: string | number;
  }>;
  blockers?: Array<{ description?: string }>;
  risks?: Array<{ description?: string }>;
  handoffs?: Array<{ description?: string }>;
  knowledge_gaps?: Array<{ description?: string }>;
  next_steps?: Array<{ description?: string }>;
  key_topics?: string[];
  participants_mentioned?: string[];
  // TODO(Section 12+): Route capsules with extracted projects_mentioned
  // to the matching project Hive via HiveService lookup. For 11C the
  // field is extracted into capsule metadata but capsules are not
  // hive-routed by project. Wire-up requires (a) HiveService.findByName
  // for project-name lookup within the org's hive tree, (b) hive_id
  // assignment on the capsule write path. Section 12 owns this work
  // when Otzar Control Tower formalizes project surface area.
  projects_mentioned?: string[];
  external_entities_mentioned?: string[];
}

// WHAT: Compute the dedup content_hash exactly the way Section 1C
//        and Section 11A's writeService do. sha256(content.slice(0,
//        500)) gives a stable hash even if a long event has small
//        trailing differences (timestamps, signatures).
function dedupContentHash(content: string): string {
  return (
    `${CRYPTO_CONFIG.HASH_ALGORITHM}:` +
    createHash(CRYPTO_CONFIG.HASH_ALGORITHM)
      .update(content.slice(0, DEDUP_CONTENT_PREFIX))
      .digest("hex")
  );
}

// WHAT: Real Anthropic tokenizer count via lazy require to keep WASM
//        out of test-only imports.
function countTokensAnthropic(content: string): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { countTokens } = require("@anthropic-ai/tokenizer") as {
    countTokens: (text: string) => number;
  };
  return countTokens(content);
}

// WHAT: Defensive due-date parser. Accepts numeric millis, numeric
//        seconds, ISO-8601 strings, "tomorrow"-style relative
//        strings (deferred to Section 14 NLP). Returns null on
//        garbage input.
// INPUT: string | number | undefined
// OUTPUT: a valid Date OR null
// WHY: LLMs return wildly inconsistent date shapes. We parse what we
//      can and silently ignore the rest -- a missing commitment_date
//      is acceptable; a corrupted one would poison the priming
//      query that filters by [now, now+48h].
function parseCommitmentDate(due: string | number | undefined): Date | null {
  if (due === undefined) return null;
  const parsed =
    typeof due === "number" ? new Date(due) : new Date(due);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// WHAT: Build the extraction prompt. Industry + vocab context +
//        event_type + content. JSON-only response requested.
function buildExtractionPrompt(args: {
  industry: string | null;
  vocabContext: string;
  eventType: string;
  content: string;
}): { system: string; user: string } {
  const system = [
    `The organization operates in ${args.industry ?? "an unspecified industry"}.`,
    args.vocabContext.length > 0
      ? `Known org terms: ${args.vocabContext}.`
      : "No domain vocabulary registered yet.",
    `Analyze this ${args.eventType}. Extract as JSON:`,
    `{ decisions, action_items, commitments, blockers, risks, handoffs,`,
    `  knowledge_gaps, next_steps, key_topics, participants_mentioned,`,
    `  projects_mentioned, external_entities_mentioned }`,
    `decisions: list of { topic, outcome }`,
    `commitments: list of { description, due } (due may be ISO-8601 or unix-ms)`,
    `external_entities_mentioned: names of clients/partners/vendors mentioned`,
    `key_topics: list of strings (acronyms or proper nouns from the conversation)`,
    `Return ONLY valid JSON.`,
  ].join("\n");
  return { system, user: args.content };
}

// WHAT: The observation service.
// INPUT: AuthService + LLMProvider.
// OUTPUT: A class with observe, processCorrection, addDomainTerm.
// WHY: Constructor injection lets tests swap MockLLMProvider for
//      deterministic extraction shapes.
export class ObservationService {
  constructor(
    private readonly authService: AuthService,
    private readonly llmProvider: LLMProvider,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // observe -- the main pipeline.
  //
  // ROUTING INVARIANT (PORTABILITY): decisions write to the ORG
  // wallet (org property); commitments / work patterns / personal
  // insights write to the EMPLOYEE wallet (portable). If anyone
  // ever flips this, the patent's three-wallet portability claim
  // breaks. Test #9 (PORTABILITY ROUTING) verifies BOTH sides
  // concretely.
  //
  // BYPASSING writeService: we route individual extracted items to
  // different wallets in a single observe() call, which writeService
  // doesn't support (it writes to caller's wallet only). Same pattern
  // as dandelion.service.ts Phase 0 inline entity creation. Section
  // 13 may consolidate if duplication grows meaningful. We replicate
  // writeService's write-side correctness manually: content_hash via
  // sha256, tokens via countTokensAnthropic, tokens_tokenizer
  // "anthropic", writeAuditEvent CAPSULE_CREATED for each capsule.
  // ──────────────────────────────────────────────────────────────
  async observe(
    input: ObserveInput,
  ): Promise<ObserveSuccess | ObserveSkipped | ObserveFailure> {
    const session = await this.authService.validateSession(input.token, "write");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "observe denied" };
    }
    const callerEntityId = session.entity_id;

    // Resolve org. Caller can override (admin tooling); else look up.
    let orgEntityId: string | null = null;
    if (typeof input.org_entity_id === "string" && input.org_entity_id.length > 0) {
      orgEntityId = input.org_entity_id;
    } else {
      const { getOrgEntityId } = await import("../governance/org.js");
      try {
        orgEntityId = await getOrgEntityId(callerEntityId);
      } catch {
        orgEntityId = null;
      }
    }
    if (orgEntityId === null) {
      return {
        ok: false,
        code: "ORG_NOT_RESOLVED",
        message: "observe requires an org context (caller is orgless)",
      };
    }

    // Look up employee + org wallets up front.
    const [callerWallet, orgWallet] = await Promise.all([
      prisma.wallet.findUnique({ where: { entity_id: callerEntityId } }),
      prisma.wallet.findUnique({ where: { entity_id: orgEntityId } }),
    ]);
    if (callerWallet === null || orgWallet === null) {
      return {
        ok: false,
        code: "ORG_NOT_RESOLVED",
        message: "caller or org has no wallet",
      };
    }

    // Dedup check.
    const contentHash = dedupContentHash(input.content);
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const dup = await prisma.memoryCapsule.findFirst({
      where: { content_hash: contentHash, created_at: { gte: since } },
      select: { capsule_id: true },
    });
    if (dup !== null) {
      return { ok: true, skipped: true, reason: "DUPLICATE_CONTENT" };
    }

    // Pull org's vocabulary + industry for the extraction prompt.
    const [vocab, orgSettings] = await Promise.all([
      prisma.domainVocabulary.findMany({
        where: { org_entity_id: orgEntityId },
        select: { term: true, term_type: true },
      }),
      prisma.orgSettings.findUnique({
        where: { org_entity_id: orgEntityId },
      }),
    ]);
    const vocabContext = vocab
      .map((v) => `${v.term} (${v.term_type})`)
      .join(", ");

    // Run extraction.
    const prompt = buildExtractionPrompt({
      industry: orgSettings?.industry ?? null,
      vocabContext,
      eventType: input.event_type,
      content: input.content,
    });
    const llm = await this.llmProvider.generateResponse(prompt);
    if (!llm.ok) {
      return {
        ok: false,
        code: "EXTRACTION_FAILED",
        message: "LLM provider failed",
        details: { fallback: llm.fallback_message },
      };
    }
    let extracted: ExtractedIntelligence;
    try {
      // LLM may wrap JSON in markdown fences; strip them defensively.
      const stripped = llm.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      extracted = JSON.parse(stripped) as ExtractedIntelligence;
    } catch (err) {
      return {
        ok: false,
        code: "EXTRACTION_FAILED",
        message: "LLM response was not valid JSON",
        details: {
          parse_error: err instanceof Error ? err.message : String(err),
          llm_response: llm.text.slice(0, 500),
        },
      };
    }

    // Route per-item to the right wallet.
    const capsuleIds: string[] = [];
    let decisionsCount = 0;
    let commitmentsCount = 0;
    let workPatternsCount = 0;

    // Decisions → ORG wallet.
    for (const d of extracted.decisions ?? []) {
      const summary = `${d.topic ?? "untitled"}: ${d.outcome ?? ""}`.trim();
      if (summary.length === 0) continue;
      const id = await this.writeCapsule({
        wallet_id: orgWallet.wallet_id,
        entity_id: orgEntityId,
        capsule_type: "DECISION",
        topic_tags: ["decision", d.topic ?? "untitled"].filter(
          (t) => t.length > 0,
        ),
        payload_summary: summary,
        content_hash: contentHash,
        actor_entity_id: callerEntityId,
        commitment_date: null,
      });
      capsuleIds.push(id);
      decisionsCount++;
    }

    // Commitments → EMPLOYEE wallet (with parsed commitment_date).
    for (const c of extracted.commitments ?? []) {
      const summary = c.description ?? "";
      if (summary.length === 0) continue;
      const id = await this.writeCapsule({
        wallet_id: callerWallet.wallet_id,
        entity_id: callerEntityId,
        capsule_type: "COMMITMENT",
        topic_tags: ["commitment"],
        payload_summary: summary,
        content_hash: contentHash,
        actor_entity_id: callerEntityId,
        commitment_date: parseCommitmentDate(c.due),
      });
      capsuleIds.push(id);
      commitmentsCount++;
    }

    // Key topics → EMPLOYEE wallet as WORK_PATTERN signals.
    for (const topic of extracted.key_topics ?? []) {
      if (typeof topic !== "string" || topic.length === 0) continue;
      const id = await this.writeCapsule({
        wallet_id: callerWallet.wallet_id,
        entity_id: callerEntityId,
        capsule_type: "WORK_PATTERN",
        topic_tags: [topic],
        payload_summary: `Topic surfaced: ${topic}`,
        content_hash: contentHash,
        actor_entity_id: callerEntityId,
        commitment_date: null,
      });
      capsuleIds.push(id);
      workPatternsCount++;
    }

    // External entity detection.
    const externalsCount = await this.detectExternalEntities({
      orgEntityId,
      orgSettingsTrack: orgSettings?.track_external_entities ?? true,
      mentions: extracted.external_entities_mentioned ?? [],
    });

    // Vocabulary growth.
    const vocabGrowth = await this.growVocabulary({
      orgEntityId,
      candidateTerms: extracted.key_topics ?? [],
    });

    return {
      ok: true,
      capsule_ids: capsuleIds,
      extracted_summary: {
        decisions: decisionsCount,
        commitments: commitmentsCount,
        work_patterns: workPatternsCount,
        external_entities: externalsCount,
        vocab_growth: vocabGrowth,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // processCorrection -- writes a CORRECTION capsule to the
  // EMPLOYEE wallet. Layer 1 of conductSession (Section 11B) reads
  // these and orders them BEFORE the role template (Layer 2).
  //
  // The schema lifecycle is via deleted_at, not an explicit status
  // column. The spec says "status='ACTIVE'"; this schema encodes
  // that as deleted_at IS NULL.
  // ──────────────────────────────────────────────────────────────
  async processCorrection(
    input: CorrectionInput,
  ): Promise<CorrectionSuccess | ObserveFailure> {
    const session = await this.authService.validateSession(input.token, "write");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "correction denied" };
    }
    const callerEntityId = session.entity_id;
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: callerEntityId },
    });
    if (wallet === null) {
      return {
        ok: false,
        code: "ORG_NOT_RESOLVED",
        message: "caller has no wallet",
      };
    }
    const summary = `${input.incorrect_description} → ${input.correct_behavior}`;
    const tags = ["correction"];
    if (typeof input.target_capsule_id === "string" && input.target_capsule_id.length > 0) {
      tags.push(`correction-of-${input.target_capsule_id}`);
    }
    const id = await this.writeCapsule({
      wallet_id: wallet.wallet_id,
      entity_id: callerEntityId,
      capsule_type: "CORRECTION",
      topic_tags: tags,
      payload_summary: summary,
      content_hash: dedupContentHash(summary),
      actor_entity_id: callerEntityId,
      commitment_date: null,
    });
    return { ok: true, correction_capsule_id: id };
  }

  // ──────────────────────────────────────────────────────────────
  // addDomainTerm -- wraps the same prisma.domainVocabulary path
  // POST /org/vocabulary uses. JSDoc on both routes documents the
  // alias relationship. Idempotent via createMany skipDuplicates
  // on the (org_entity_id, term) unique.
  // ──────────────────────────────────────────────────────────────
  async addDomainTerm(
    input: AddDomainTermInput,
  ): Promise<AddDomainTermSuccess | ObserveFailure> {
    const session = await this.authService.validateSession(input.token, "write");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "vocab add denied" };
    }
    const callerEntityId = session.entity_id;
    let orgEntityId: string | null = null;
    if (typeof input.org_entity_id === "string" && input.org_entity_id.length > 0) {
      orgEntityId = input.org_entity_id;
    } else {
      const { getOrgEntityId } = await import("../governance/org.js");
      try {
        orgEntityId = await getOrgEntityId(callerEntityId);
      } catch {
        orgEntityId = null;
      }
    }
    if (orgEntityId === null) {
      return {
        ok: false,
        code: "ORG_NOT_RESOLVED",
        message: "vocab add requires an org context",
      };
    }
    await prisma.domainVocabulary.createMany({
      data: [
        {
          org_entity_id: orgEntityId,
          term: input.term,
          term_type: input.term_type,
          definition: input.definition ?? null,
          aliases: input.aliases ?? [],
        },
      ],
      skipDuplicates: true,
    });
    const row = await prisma.domainVocabulary.findUnique({
      where: {
        org_entity_id_term: { org_entity_id: orgEntityId, term: input.term },
      },
    });
    return { ok: true, vocabulary_id: row?.vocab_id ?? "" };
  }

  // ──────────────────────────────────────────────────────────────
  // detectExternalEntities -- gated by OrgSettings.track_external_
  // entities. For each mention: vocab match (CLIENT/PARTNER/VENDOR)
  // → use vocab type; else upsert ExternalEntity (case-insensitive
  // name match), incrementing mention_count + refreshing
  // last_mentioned. Default new-entity type: "CLIENT".
  // ──────────────────────────────────────────────────────────────
  private async detectExternalEntities(args: {
    orgEntityId: string;
    orgSettingsTrack: boolean;
    mentions: string[];
  }): Promise<number> {
    if (!args.orgSettingsTrack) return 0;
    let count = 0;
    for (const rawName of args.mentions) {
      if (typeof rawName !== "string" || rawName.trim().length === 0) continue;
      const name = rawName.trim();

      // Vocab seed for entity_type.
      const vocab = await prisma.domainVocabulary.findFirst({
        where: {
          org_entity_id: args.orgEntityId,
          term: { equals: name, mode: "insensitive" },
          term_type: { in: ["CLIENT", "PARTNER", "VENDOR"] },
        },
      });
      const seedType = vocab?.term_type ?? "CLIENT";

      // Existing ExternalEntity (case-insensitive)?
      const existing = await prisma.externalEntity.findFirst({
        where: {
          org_entity_id: args.orgEntityId,
          name: { equals: name, mode: "insensitive" },
        },
      });
      if (existing !== null) {
        await prisma.externalEntity.update({
          where: { external_id: existing.external_id },
          data: {
            mention_count: { increment: 1 },
            last_mentioned: new Date(),
          },
        });
      } else {
        await prisma.externalEntity.create({
          data: {
            org_entity_id: args.orgEntityId,
            name,
            entity_type: seedType,
            last_mentioned: new Date(),
          },
        });
      }
      count++;
    }
    return count;
  }

  // ──────────────────────────────────────────────────────────────
  // growVocabulary -- if a key_topic appears in 3+ recent capsules
  // for this org and isn't already in DomainVocabulary, auto-add as
  // ACRONYM. Admin can reclassify later.
  // ──────────────────────────────────────────────────────────────
  private async growVocabulary(args: {
    orgEntityId: string;
    candidateTerms: string[];
  }): Promise<number> {
    let added = 0;
    const since = new Date(
      Date.now() - VOCAB_GROWTH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    // All wallets owned by entities in this org -- to constrain the
    // counting query to the org's footprint.
    const orgMembers = await prisma.entityMembership.findMany({
      where: { parent_id: args.orgEntityId, is_active: true },
      select: { child_id: true },
    });
    const memberIds = [args.orgEntityId, ...orgMembers.map((m) => m.child_id)];
    const wallets = await prisma.wallet.findMany({
      where: { entity_id: { in: memberIds } },
      select: { wallet_id: true },
    });
    const walletIds = wallets.map((w) => w.wallet_id);

    for (const rawTerm of args.candidateTerms) {
      if (typeof rawTerm !== "string" || rawTerm.trim().length === 0) continue;
      const term = rawTerm.trim();
      // Already in vocab?
      const existing = await prisma.domainVocabulary.findFirst({
        where: {
          org_entity_id: args.orgEntityId,
          term: { equals: term, mode: "insensitive" },
        },
      });
      if (existing !== null) continue;
      // Count recent capsules with this term in payload_summary or
      // topic_tags.
      const count = await prisma.memoryCapsule.count({
        where: {
          wallet_id: { in: walletIds },
          deleted_at: null,
          created_at: { gte: since },
          OR: [
            { payload_summary: { contains: term, mode: "insensitive" } },
            { topic_tags: { has: term } },
          ],
        },
      });
      if (count >= VOCAB_GROWTH_THRESHOLD) {
        await prisma.domainVocabulary.createMany({
          data: [
            {
              org_entity_id: args.orgEntityId,
              term,
              term_type: "ACRONYM",
            },
          ],
          skipDuplicates: true,
        });
        added++;
      }
    }
    return added;
  }

  // ──────────────────────────────────────────────────────────────
  // writeCapsule -- single direct prisma.memoryCapsule.create
  // wrapper that replicates writeService's write-side correctness
  // (content_hash + tokens + tokens_tokenizer + audit event).
  // ──────────────────────────────────────────────────────────────
  private async writeCapsule(args: {
    wallet_id: string;
    entity_id: string;
    capsule_type: CapsuleType;
    topic_tags: string[];
    payload_summary: string;
    content_hash: string;
    actor_entity_id: string;
    commitment_date: Date | null;
  }): Promise<string> {
    const newCapsuleId = randomUUID();
    const tokens = countTokensAnthropic(args.payload_summary);
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: newCapsuleId,
        wallet_id: args.wallet_id,
        entity_id: args.entity_id,
        version: 1,
        capsule_type: args.capsule_type,
        topic_tags: args.topic_tags,
        decay_type: "TIME_BASED",
        payload_summary: args.payload_summary,
        payload_size_tokens: Math.ceil(args.payload_summary.length / 4),
        tokens,
        tokens_tokenizer: "anthropic",
        storage_location: `niov://otzar/observe/${newCapsuleId}`,
        content_hash: args.content_hash,
        commitment_date: args.commitment_date,
        created_by: args.actor_entity_id,
      },
    });
    await writeAuditEvent({
      event_type: "CAPSULE_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.entity_id,
      target_capsule_id: newCapsuleId,
      details: {
        via: "observation_service",
        capsule_type: args.capsule_type,
      },
    });
    return newCapsuleId;
  }
}
