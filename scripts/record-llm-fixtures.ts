// FILE: record-llm-fixtures.ts
// PURPOSE: Maintainer-driven recording script for the FixtureBased
//          LLMProvider per ADR-0012 (recording architecture preserved)
//          + ADR-0014 (key-based dispatch). Calls real Claude with
//          temperature=0 for each curated prompt and writes JSON
//          fixtures into tests/fixtures/llm/. Idempotent: skips
//          existing fixtures whose hash matches the curated prompt;
//          re-records when the curated prompt has been edited.
// CONNECTS TO: @anthropic-ai/sdk (production AnthropicProvider's
//              SDK at the same pinned version), apps/api/src/services/llm/
//              llm.service.ts (computeLLMInputHash + FixtureFile),
//              .env.test.local (operator's ANTHROPIC_API_KEY),
//              tests/fixtures/llm/<fixtureKey>.json (output).
//
// USAGE: set -a && source .env.test.local && set +a
//        npx tsx scripts/record-llm-fixtures.ts
// REQUIRES: ANTHROPIC_API_KEY in environment (loaded from
//           .env.test.local, never committed). Never runs in CI.
//
// REPRESENTATIVE PROMPTS — READ BEFORE EDITING CURATED_PROMPTS:
// The curated prompts are *representative samples* of what
// production services construct in each scenario, not literal
// extracts from test runs. Per ADR-0014, test prompts include
// non-deterministic content (UUIDs from makeEntityInput in
// tests/helpers.ts) that varies per run. The recorded fullHash
// reflects the curated prompt; live test prompts will produce
// different hashes. This is expected and benign: ADR-0014
// specifies hash as a sanity check (warning on mismatch), not
// as dispatch. Tests dispatch by fixtureKey; the recorded
// response replays regardless of input hash. When editing a
// curated prompt below, the next recording run will detect the
// hash drift and re-record the fixture.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";
import {
  computeLLMInputHash,
  type FixtureFile,
} from "../apps/api/src/services/llm/llm.service.js";

// WHAT: Shape of one curated prompt entry.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Mirrors the {system,user,context?} triple LLMProvider.
//      generateResponse takes, plus the metadata fields ADR-0014
//      requires in the recorded fixture file (sourceFile,
//      promptId, fixtureKey).
interface CuratedPrompt {
  fixtureKey: string;
  system: string;
  user: string;
  context?: string;
  sourceFile: string;
  promptId: string;
}

// WHAT: Recording model. Matches AnthropicProvider's default
//        (llm.service.ts:197).
const MODEL = "claude-sonnet-4-6";

// WHAT: Recording temperature. Per ADR-0012 §Decision, fixtures
//        are recorded at temperature=0 for determinism. Production
//        AnthropicProvider does NOT pin temperature; this is a
//        deliberate recording-time-only choice.
const TEMPERATURE = 0;

// WHAT: Output directory. Matches FixtureBasedLLMProvider's
//        default (llm.service.ts constructor).
const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/llm");

// WHAT: The 10 curated prompts approved at Track A Gate 3 Half B
//        pre-flight (locked count). Each is a representative
//        sample, not a literal test extract; see file header for
//        the dispatch-by-key rationale.
const CURATED_PROMPTS: ReadonlyArray<CuratedPrompt> = [
  // -- 1: integration otzar conversation happy path
  {
    fixtureKey: "otzar-conversation-happy-path",
    sourceFile: "tests/integration/otzar-routes.test.ts:108",
    promptId: "otzar-routes-conversation-happy-path",
    system: [
      "You are Otzar, an AI conversational assistant operating under the NIOV protocol.",
      "Operator entity: 00000000-0000-4000-8000-000000000001 (Test Person).",
      "Twin role: digital twin, autonomy_level=APPROVAL_REQUIRED, role_template=null.",
      "Wallet contents: empty (no prior capsules).",
      "Priming context: none for this session.",
      "Conversation history: empty (this is the first message).",
    ].join("\n\n"),
    user: "hello otzar",
  },

  // -- 2: integration otzar close conversation with topic extraction
  {
    fixtureKey: "otzar-conversation-close-with-topics",
    sourceFile: "tests/integration/otzar-routes.test.ts:173",
    promptId: "otzar-routes-close-conversation-topic-extraction",
    // Production prompt verbatim from
    // apps/api/src/services/otzar/otzar.service.ts:629
    // (G5b-I Resolution Gate: prior recording prompt asked for
    // JSON shape and diverged from production's "topics: a, b, c"
    // request).
    system:
      "Extract the top 3 topics from this conversation. Respond with exactly: 'topics: a, b, c'.",
    user: [
      "user: hello otzar",
      "assistant: Hello! How can I help today?",
      "user: I need help drafting the Q3 release notes for the iOS client.",
      "assistant: I can help with that. What features shipped in Q3?",
      "user: dark mode, push notifications, offline mode, and a new onboarding flow.",
      "assistant: Got it. I'll draft sections for each feature.",
    ].join("\n"),
  },

  // -- 3: integration observation extraction (TECH industry, release context)
  {
    fixtureKey: "observation-extraction-tech-release",
    sourceFile: "tests/integration/observation-routes.test.ts:118",
    promptId: "observation-routes-extraction-tech-release",
    system: [
      "The organization operates in TECH.",
      "No domain vocabulary registered yet.",
      "Analyze this conversation. Extract as JSON:",
      "{ decisions, action_items, commitments, blockers, risks, handoffs,",
      "  knowledge_gaps, next_steps, key_topics, participants_mentioned,",
      "  projects_mentioned, external_entities_mentioned }",
      "decisions: list of { topic, outcome }",
      "commitments: list of { description, due } (due may be ISO-8601 or unix-ms)",
      "external_entities_mentioned: names of clients/partners/vendors mentioned",
      "key_topics: list of strings (acronyms or proper nouns from the conversation)",
      "Return ONLY valid JSON.",
    ].join("\n"),
    user: [
      "Pat: We need to lock the release date.",
      "Sam: I think we ship Friday. Marketing is ready.",
      "Pat: Agreed. Friday it is. I'll update the release tracker.",
      "Sam: I'll send the all-hands announcement Wednesday.",
    ].join("\n"),
  },

  // -- 4: unit otzar conductSession happy path
  {
    fixtureKey: "unit-otzar-conduct-session-happy-path",
    sourceFile: "tests/unit/otzar.test.ts:341",
    promptId: "unit-otzar-conduct-session-happy-path",
    system: [
      "You are Otzar, an AI conversational assistant operating under the NIOV protocol.",
      "Operator entity: 00000000-0000-4000-8000-000000000002.",
      "Twin role: digital twin, autonomy_level=APPROVAL_REQUIRED.",
      "Wallet contents: empty (test fixture, no prior capsules).",
      "Priming context: none.",
    ].join("\n\n"),
    user: "Can you summarize what I worked on this week?",
  },

  // -- 5: unit otzar L7 morning brief priming
  {
    fixtureKey: "unit-otzar-l7-morning-brief",
    sourceFile: "tests/unit/otzar.test.ts:375",
    promptId: "unit-otzar-l7-morning-brief",
    system: [
      "You are Otzar, an AI conversational assistant.",
      "Operator entity: 00000000-0000-4000-8000-000000000003.",
      "L7 morning brief (2026-05-06): 2 commitments due today; 1 deferred from yesterday.",
      "Commitment 1: review Q3 release notes (due 2026-05-06T17:00:00Z).",
      "Commitment 2: respond to partner email re: integration timeline (due 2026-05-06T15:00:00Z).",
      "Deferred: schedule 1:1 with engineering lead.",
    ].join("\n\n"),
    user: "What's on my plate today?",
  },

  // -- 6: unit otzar correction layer ordered before role template
  {
    fixtureKey: "unit-otzar-correction-layer-priority",
    sourceFile: "tests/unit/otzar.test.ts:564",
    promptId: "unit-otzar-correction-layer-priority",
    system: [
      "CORRECTION (highest priority): when answering questions about project deadlines, always reference the canonical project tracker, not memory of past conversations.",
      "Role template: digital twin acting as a research assistant.",
      "Operator entity: 00000000-0000-4000-8000-000000000004.",
      "Wallet contents: 1 CORRECTION capsule (the correction text above).",
    ].join("\n\n"),
    user: "When is the Phase 2 deadline?",
  },

  // -- 7: unit otzar close conversation topics for audit emission
  {
    fixtureKey: "unit-otzar-close-conversation-topics",
    sourceFile: "tests/unit/otzar.test.ts:660",
    promptId: "unit-otzar-close-conversation-topics",
    // Production prompt verbatim from
    // apps/api/src/services/otzar/otzar.service.ts:629
    // (G5b-I Resolution Gate: prior recording prompt asked for
    // JSON shape and diverged from production's "topics: a, b, c"
    // request).
    system:
      "Extract the top 3 topics from this conversation. Respond with exactly: 'topics: a, b, c'.",
    user: [
      "user: I want to revisit our hiring plan for Q4.",
      "assistant: What roles are top of mind?",
      "user: backend engineer (senior), product designer, and a part-time technical writer.",
      "assistant: Are there budget constraints?",
      "user: Yes, total H2 budget is 240k including overhead.",
      "assistant: Noted. I'll draft a hiring roadmap with phasing.",
    ].join("\n"),
  },

  // -- 8: unit observation, vocab-known CLIENT term
  {
    fixtureKey: "unit-observation-vocab-known-client",
    sourceFile: "tests/unit/observation.test.ts:254",
    promptId: "unit-observation-vocab-known-client",
    system: [
      "The organization operates in CONSULTING.",
      "Known org terms: Acme Corp (CLIENT), Helix (PROJECT_CODENAME).",
      "Analyze this conversation. Extract as JSON:",
      "{ decisions, action_items, commitments, blockers, risks, handoffs,",
      "  knowledge_gaps, next_steps, key_topics, participants_mentioned,",
      "  projects_mentioned, external_entities_mentioned }",
      "decisions: list of { topic, outcome }",
      "commitments: list of { description, due } (due may be ISO-8601 or unix-ms)",
      "external_entities_mentioned: names of clients/partners/vendors mentioned",
      "key_topics: list of strings (acronyms or proper nouns from the conversation)",
      "Return ONLY valid JSON.",
    ].join("\n"),
    user: [
      "Pat: Acme Corp wants to expand the Helix scope.",
      "Sam: They added two more workstreams. I'll send the revised SOW Tuesday.",
      "Pat: Make sure the timeline reflects the new scope.",
    ].join("\n"),
  },

  // -- 9: unit observation, unknown CLIENT name (no prior vocab)
  {
    fixtureKey: "unit-observation-vocab-unknown-name",
    sourceFile: "tests/unit/observation.test.ts:307",
    promptId: "unit-observation-vocab-unknown-name",
    system: [
      "The organization operates in CONSULTING.",
      "No domain vocabulary registered yet.",
      "Analyze this conversation. Extract as JSON:",
      "{ decisions, action_items, commitments, blockers, risks, handoffs,",
      "  knowledge_gaps, next_steps, key_topics, participants_mentioned,",
      "  projects_mentioned, external_entities_mentioned }",
      "decisions: list of { topic, outcome }",
      "commitments: list of { description, due } (due may be ISO-8601 or unix-ms)",
      "external_entities_mentioned: names of clients/partners/vendors mentioned",
      "key_topics: list of strings (acronyms or proper nouns from the conversation)",
      "Return ONLY valid JSON.",
    ].join("\n"),
    user: [
      "Pat: We just landed Northwind Industries as a new client.",
      "Sam: Great. I'll set up the kickoff for next Monday.",
      "Pat: Make sure to loop in legal for the MSA review.",
    ].join("\n"),
  },

  // -- 10: unit observation, portability routing (decisions + insights)
  {
    fixtureKey: "unit-observation-portability-routing",
    sourceFile: "tests/unit/observation.test.ts:488",
    promptId: "unit-observation-portability-routing",
    system: [
      "The organization operates in TECH.",
      "Known org terms: Phoenix (PROJECT_CODENAME).",
      "Analyze this conversation. Extract as JSON:",
      "{ decisions, action_items, commitments, blockers, risks, handoffs,",
      "  knowledge_gaps, next_steps, key_topics, participants_mentioned,",
      "  projects_mentioned, external_entities_mentioned }",
      "decisions: list of { topic, outcome }",
      "commitments: list of { description, due } (due may be ISO-8601 or unix-ms)",
      "external_entities_mentioned: names of clients/partners/vendors mentioned",
      "key_topics: list of strings (acronyms or proper nouns from the conversation)",
      "Return ONLY valid JSON.",
    ].join("\n"),
    user: [
      "Pat: We're going with PostgreSQL for Phoenix. Locked in.",
      "Sam: I noticed the team works better when standups are async-first; might pitch that to leadership.",
      "Pat: Good idea. Decision on database is final though, let's not revisit.",
    ].join("\n"),
  },
];

// WHAT: Recording-script entry point. Validates env, ensures
//        fixtures directory exists, iterates curated prompts,
//        records (or skips if hash matches) each one.
// INPUT: None (reads ANTHROPIC_API_KEY from env, CURATED_PROMPTS
//        constant).
// OUTPUT: A promise that resolves with summary counts; exits
//          non-zero on any unrecoverable failure.
// WHY: ADR-0012 §Decision specifies maintainer-driven recording;
//      this main() is the script's contract surface. Idempotency
//      (skip-existing-with-matching-hash) lets the operator
//      re-run safely when adding new prompts without re-paying
//      API cost on the existing ones.
async function main(): Promise<void> {
  // Step 1 — Load .env.test.local (operator's ANTHROPIC_API_KEY).
  loadDotenv({ path: resolve(process.cwd(), ".env.test.local") });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    process.stderr.write(
      "ANTHROPIC_API_KEY not set. Populate .env.test.local from " +
        ".env.test.local.example with a real key (sk-ant-...). " +
        "Recording cannot proceed.\n",
    );
    process.exit(1);
  }

  // Step 2 — Ensure fixtures directory exists.
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }
  process.stdout.write(`Fixtures directory: ${FIXTURES_DIR}\n`);

  // Step 3 — Initialize Anthropic SDK.
  const client = new Anthropic({ apiKey });

  let recordedCount = 0;
  let skippedCount = 0;
  let rerecordedCount = 0;

  // Step 4 — Loop over curated prompts.
  for (const prompt of CURATED_PROMPTS) {
    const fullHash = computeLLMInputHash({
      system: prompt.system,
      user: prompt.user,
      context: prompt.context,
    });
    const filePath = resolve(FIXTURES_DIR, `${prompt.fixtureKey}.json`);

    // Idempotent check: skip if existing fixture's hash matches.
    if (existsSync(filePath)) {
      try {
        const existing = JSON.parse(
          readFileSync(filePath, "utf-8"),
        ) as FixtureFile;
        if (existing.fullHash === fullHash) {
          process.stdout.write(
            `  skipping ${prompt.fixtureKey} (fixture exists, hash matches)\n`,
          );
          skippedCount++;
          continue;
        }
        process.stdout.write(
          `  re-recording ${prompt.fixtureKey} (curated prompt edited; ` +
            `hash drift detected)\n`,
        );
        rerecordedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `  warning: existing fixture ${prompt.fixtureKey} unreadable ` +
            `(${message}); will re-record\n`,
        );
        rerecordedCount++;
      }
    }

    // Step 4a — Build userContent the same way AnthropicProvider does
    // (llm.service.ts:206-209) so the recorded prompt is byte-identical
    // to what production would have submitted given these inputs.
    const userContent =
      prompt.context !== undefined && prompt.context.length > 0
        ? `${prompt.context}\n\n---\n\n${prompt.user}`
        : prompt.user;

    // Step 4b — Call Claude with temperature=0.
    let claudeResponse;
    try {
      claudeResponse = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: TEMPERATURE,
        system: prompt.system,
        messages: [{ role: "user", content: userContent }],
      });
    } catch (err) {
      const errName = err instanceof Error ? err.name : "Error";
      const errMessage = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `\nERROR recording ${prompt.fixtureKey}: ${errName}: ${errMessage}\n` +
          `Aborting. Fix the issue and re-run; idempotency will skip ` +
          `already-recorded fixtures.\n`,
      );
      process.exit(1);
    }

    // Step 4c — Extract response text from Claude SDK shape.
    const text = claudeResponse.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("");

    // Step 4d — Build the FixtureFile object per ADR-0014 shape.
    const fixture: FixtureFile = {
      fixtureKey: prompt.fixtureKey,
      fullHash,
      input: {
        system: prompt.system,
        user: prompt.user,
        context: prompt.context ?? null,
      },
      response: {
        ok: true,
        text,
        provider: "anthropic",
        model: claudeResponse.model,
      },
      metadata: {
        recordedAt: new Date().toISOString(),
        recordingTemperature: TEMPERATURE,
        sourceFile: prompt.sourceFile,
        promptId: prompt.promptId,
      },
    };

    // Step 4e — Write fixture as pretty-printed JSON.
    try {
      writeFileSync(filePath, JSON.stringify(fixture, null, 2) + "\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `\nERROR writing fixture ${filePath}: ${message}\n`,
      );
      process.exit(1);
    }

    process.stdout.write(
      `  recorded ${prompt.fixtureKey}.json (input hash: ${fullHash.slice(
        0,
        16,
      )}...)\n`,
    );
    recordedCount++;
  }

  // Step 5 — Summary.
  process.stdout.write(
    `\nDone. Recorded ${recordedCount} new, re-recorded ` +
      `${rerecordedCount}, skipped ${skippedCount} ` +
      `(total curated: ${CURATED_PROMPTS.length}).\n`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`UNHANDLED ERROR: ${message}\n`);
  process.exit(1);
});
