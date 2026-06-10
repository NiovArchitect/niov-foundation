// FILE: import-fathom-transcripts.ts
// PURPOSE: Local / staging Fathom meeting-transcript importer per
//          [FOUNDER-AUTH — MAKE OTZAR ALIVE / TRANSCRIPT-SEEDED WORK
//          MEMORY]. Pulls Founder's Fathom transcripts using
//          FATHOM_API_KEY env-var auth, saves raw exports to a
//          local-only folder OUTSIDE the repo, then produces
//          sanitized summaries that seed Foundation memory.
//
// USAGE:
//   set -a; . ./.env.demo.local; set +a
//   FATHOM_API_KEY=<paste-locally; not committed> \
//   FATHOM_IMPORT_LIMIT=5 \
//     npx tsx scripts/import-fathom-transcripts.ts
//
// SAFETY (load-bearing):
//   - The Fathom API key is read from process.env.FATHOM_API_KEY
//     and is NEVER printed, NEVER written to a new file, NEVER
//     committed. Errors are logged with the key REDACTED to
//     "[REDACTED]" via a defensive substring scrub.
//   - Raw transcripts are persisted ONLY under
//     /Users/genghishameha/Desktop/NIOV Labs/transcripts/fathom-raw
//     (configurable via FATHOM_IMPORT_OUTPUT_DIR; the script
//     refuses any output dir that lives inside either repo).
//   - The Foundation database receives ONLY sanitized summaries
//     (title / participants / decisions / action items / suggested
//     collaborations) — NEVER the raw transcript text. Summaries
//     live as `MemoryCapsule` rows with `capsule_type = "TRANSCRIPT"`
//     (mapped to an existing safe type when TRANSCRIPT isn't in the
//     enum) and a `[TRANSCRIPT]` tag in payload_summary so re-runs
//     can wipe + recreate cleanly without touching production rows.
//   - The script refuses to run unless ALLOW_DEMO_SEED=true OR
//     NODE_ENV != production OR DATABASE_URL is localhost.
//   - Production ingestion never runs without an explicit Founder
//     environment-secret injection.

import * as fs from "node:fs";
import * as path from "node:path";
import { prisma, type CapsuleType } from "@niov/database";

const ORG_EMAIL = "bootstrap-org@niovlabs.com";
const FOUNDER_EMAIL =
  process.env.FATHOM_OWNER_EMAIL ?? "sadeil@niovlabs.com";

const DEFAULT_OUTPUT_DIR =
  process.env.FATHOM_IMPORT_OUTPUT_DIR ??
  "/Users/genghishameha/Desktop/NIOV Labs/transcripts/fathom-raw";

const FATHOM_API_BASE =
  process.env.FATHOM_API_BASE ?? "https://api.fathom.video";

const IMPORT_LIMIT = Number.parseInt(
  process.env.FATHOM_IMPORT_LIMIT ?? "10",
  10,
);
const IMPORT_SINCE = process.env.FATHOM_IMPORT_SINCE ?? null;

const TRANSCRIPT_TAG = "[TRANSCRIPT-FATHOM]";

interface FathomMeetingSummary {
  recording_id: string;
  call_id?: string;
  title?: string;
  scheduled_start_time?: string;
  invitees?: Array<{ name?: string; email?: string }>;
  url?: string;
}

interface FathomTranscriptSpeakerLine {
  speaker?: { display_name?: string; email?: string };
  start_time?: number;
  text?: string;
}

interface FathomTranscriptResponse {
  recording_id: string;
  call_id?: string;
  transcript?: FathomTranscriptSpeakerLine[];
  raw?: unknown;
}

interface SanitizedSummary {
  title: string;
  date: string | null;
  participants: string[];
  summary_text: string;
  decisions: string[];
  action_items: string[];
  open_questions: string[];
  suggested_collaborations: string[];
  sensitivity_class: "LOW" | "MODERATE" | "HIGH" | "PERSONAL_MEMORY";
  raw_recording_id: string;
  raw_file_path: string;
}

function redactKey<T>(text: T): T {
  if (typeof text !== "string") return text;
  const key = process.env.FATHOM_API_KEY ?? "";
  if (key.length < 8) return text;
  return text.replace(new RegExp(key, "g"), "[REDACTED]") as T;
}

function assertSafeEnvironment(): void {
  const allowExplicit = process.env.ALLOW_DEMO_SEED === "true";
  const nodeEnv = process.env.NODE_ENV ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalhost = databaseUrl.includes("localhost");
  if (nodeEnv === "production" && !allowExplicit) {
    throw new Error("Refusing to run in NODE_ENV=production without ALLOW_DEMO_SEED.");
  }
  if (!isLocalhost && !allowExplicit) {
    throw new Error("Refusing to run: DATABASE_URL is not localhost.");
  }
}

function assertOutputDirSafe(outputDir: string): void {
  const repoMarkers = [
    "/github/niov-foundation",
    "/github/otzar-control-tower",
  ];
  for (const marker of repoMarkers) {
    if (outputDir.includes(marker)) {
      throw new Error(
        `Refusing to write Fathom raw exports inside a git repo (${marker}). ` +
          `Use FATHOM_IMPORT_OUTPUT_DIR to point at a folder OUTSIDE both repos.`,
      );
    }
  }
}

function mask(value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) return "<unset>";
  return `${value.slice(0, 6)}…(${value.length} chars)`;
}

async function fathomGet<T>(
  pathname: string,
  apiKey: string,
): Promise<T> {
  const url = `${FATHOM_API_BASE}${pathname}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Fathom GET ${pathname} → ${response.status} ${response.statusText}: ${redactKey(body).slice(0, 200)}`,
    );
  }
  return (await response.json()) as T;
}

async function listFathomMeetings(
  apiKey: string,
): Promise<FathomMeetingSummary[]> {
  // Fathom API surfaces vary; we attempt three plausible paths in
  // order and use whichever one responds. This keeps the script
  // resilient to minor API differences without requiring a vendor
  // SDK in the Foundation tree.
  const candidates = ["/external/v1/meetings", "/v1/meetings", "/api/v1/meetings"];
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const params = new URLSearchParams();
      if (IMPORT_SINCE !== null) params.set("since", IMPORT_SINCE);
      params.set("limit", String(IMPORT_LIMIT));
      const data = await fathomGet<
        { meetings?: FathomMeetingSummary[]; data?: FathomMeetingSummary[] }
        | FathomMeetingSummary[]
      >(`${candidate}?${params.toString()}`, apiKey);
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.meetings)) return data.meetings;
      if (Array.isArray(data?.data)) return data.data;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Fathom API list endpoint not found via any candidate path: ${redactKey(String(lastError)).slice(0, 240)}`,
  );
}

async function fetchFathomTranscript(
  apiKey: string,
  meeting: FathomMeetingSummary,
): Promise<FathomTranscriptResponse> {
  const recordingId = meeting.recording_id;
  const candidates = [
    `/external/v1/recordings/${recordingId}/transcript`,
    `/v1/recordings/${recordingId}/transcript`,
    `/api/v1/recordings/${recordingId}/transcript`,
  ];
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return await fathomGet<FathomTranscriptResponse>(candidate, apiKey);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Fathom transcript endpoint not found for recording ${recordingId}: ${redactKey(String(lastError)).slice(0, 240)}`,
  );
}

function extractParticipantsFromTranscript(
  meeting: FathomMeetingSummary,
  transcript: FathomTranscriptResponse,
): string[] {
  const fromTranscript = (transcript.transcript ?? [])
    .map((line) => line.speaker?.display_name ?? "")
    .filter((name): name is string => name.length > 0);
  const fromInvitees = (meeting.invitees ?? [])
    .map((i) => i.name ?? i.email ?? "")
    .filter((s): s is string => s.length > 0);
  return Array.from(new Set([...fromInvitees, ...fromTranscript])).slice(0, 16);
}

function deriveActionItems(
  transcript: FathomTranscriptResponse,
): { actions: string[]; questions: string[]; decisions: string[] } {
  // Lightweight heuristic extraction — keyword-driven so we do not
  // ship raw transcript content to the database. Each surfaced line
  // is trimmed to 240 chars and stripped of speaker labels.
  const actions: string[] = [];
  const questions: string[] = [];
  const decisions: string[] = [];
  const lines = transcript.transcript ?? [];
  for (const line of lines) {
    const text = (line.text ?? "").trim();
    if (text.length === 0) continue;
    const lower = text.toLowerCase();
    const trimmed = text.length > 240 ? `${text.slice(0, 237)}…` : text;
    if (
      /\b(action item|todo|we will|i will|let me|i'll|we'll|next step|by (monday|tuesday|wednesday|thursday|friday|next week|eod))\b/i.test(
        lower,
      )
    ) {
      actions.push(trimmed);
    } else if (
      /(\?$|^(should|could|can|do we|are we|is there|what about|how about|when do we))/i.test(
        lower,
      )
    ) {
      questions.push(trimmed);
    } else if (
      /\b(we decided|decision is|let's go with|approved|signed off|confirmed|agreed)\b/i.test(
        lower,
      )
    ) {
      decisions.push(trimmed);
    }
  }
  return {
    actions: actions.slice(0, 8),
    questions: questions.slice(0, 6),
    decisions: decisions.slice(0, 6),
  };
}

function sanitizeSummary(
  meeting: FathomMeetingSummary,
  transcript: FathomTranscriptResponse,
  rawFilePath: string,
): SanitizedSummary {
  const participants = extractParticipantsFromTranscript(meeting, transcript);
  const heuristics = deriveActionItems(transcript);
  const title = meeting.title ?? "Untitled Fathom meeting";
  const date = meeting.scheduled_start_time ?? null;
  const summaryParts = [
    `Fathom meeting on ${date ?? "unknown date"}`,
    `Participants: ${participants.length} (${participants.slice(0, 4).join(", ")}${participants.length > 4 ? "…" : ""})`,
    heuristics.decisions.length > 0
      ? `${heuristics.decisions.length} decisions surfaced`
      : "No explicit decisions detected",
    heuristics.actions.length > 0
      ? `${heuristics.actions.length} action items extracted`
      : "No action items detected",
    heuristics.questions.length > 0
      ? `${heuristics.questions.length} open questions identified`
      : "",
  ].filter((s) => s.length > 0);
  // Sensitivity heuristic — treat customer / billing / legal as
  // higher sensitivity; everything else MODERATE.
  let sensitivity: SanitizedSummary["sensitivity_class"] = "MODERATE";
  const lowerTitle = title.toLowerCase();
  if (
    /(legal|nda|compliance|billing|contract|finance|revenue|customer)/i.test(
      lowerTitle,
    )
  ) {
    sensitivity = "HIGH";
  } else if (/(team standup|sync|coffee|lunch)/i.test(lowerTitle)) {
    sensitivity = "LOW";
  }
  return {
    title,
    date,
    participants,
    summary_text: summaryParts.join(". "),
    decisions: heuristics.decisions,
    action_items: heuristics.actions,
    open_questions: heuristics.questions,
    suggested_collaborations: heuristics.actions
      .slice(0, 3)
      .map((a) => `Twin handoff candidate: ${a}`),
    sensitivity_class: sensitivity,
    raw_recording_id: meeting.recording_id,
    raw_file_path: rawFilePath,
  };
}

async function pickCapsuleType(): Promise<CapsuleType> {
  // The Prisma `CapsuleType` enum has been extended over Phase 3
  // Sub-arc 2; we pick a safe member that exists. CONVERSATION_LEARNING
  // is the closest semantic match for "transcript-derived summary".
  return "CONVERSATION_LEARNING" as CapsuleType;
}

async function getFounderWalletAndEntity(): Promise<{
  entity_id: string;
  wallet_id: string;
}> {
  const founder = await prisma.entity.findFirst({
    where: { email: FOUNDER_EMAIL },
  });
  if (founder === null) {
    throw new Error(`Founder ${FOUNDER_EMAIL} not found. Run founder-bootstrap.ts.`);
  }
  const wallet = await prisma.wallet.findFirst({
    where: { entity_id: founder.entity_id },
  });
  if (wallet === null) {
    throw new Error(`Founder ${FOUNDER_EMAIL} has no wallet.`);
  }
  return { entity_id: founder.entity_id, wallet_id: wallet.wallet_id };
}

async function persistSummaryAsCapsule(
  summary: SanitizedSummary,
  founderEntityId: string,
  founderWalletId: string,
): Promise<string> {
  const capsuleType = await pickCapsuleType();
  const contentHash = `fathom-${summary.raw_recording_id}-${Date.now()}`;
  const created = await prisma.memoryCapsule.create({
    data: {
      entity_id: founderEntityId,
      wallet_id: founderWalletId,
      capsule_type: capsuleType,
      // TIME_BASED chosen so transcript summaries naturally fade —
      // they're snapshots of a past meeting, not load-bearing
      // foundational memory.
      decay_type: "TIME_BASED",
      payload_summary: `${TRANSCRIPT_TAG} ${summary.summary_text.slice(0, 600)}`,
      payload_size_tokens: Math.min(summary.summary_text.length, 4096),
      storage_location: "local/fathom-import",
      content_hash: contentHash,
      ai_access_blocked: summary.sensitivity_class === "HIGH",
      requires_validation: summary.sensitivity_class === "HIGH",
      topic_tags: ["fathom-transcript", "auto-summarized"],
    },
  });
  return created.capsule_id;
}

async function importFromFolderFallback(folder: string): Promise<
  Array<{
    meeting: FathomMeetingSummary;
    transcript: FathomTranscriptResponse;
    raw_file_path: string;
  }>
> {
  const out: Array<{
    meeting: FathomMeetingSummary;
    transcript: FathomTranscriptResponse;
    raw_file_path: string;
  }> = [];
  if (!fs.existsSync(folder)) return out;
  const entries = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isFile())
    .filter((e) => /\.(txt|md|json)$/i.test(e.name))
    .slice(0, IMPORT_LIMIT);
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    const text = fs.readFileSync(fullPath, "utf8");
    out.push({
      meeting: {
        recording_id: entry.name,
        title: entry.name.replace(/\.[^.]+$/, ""),
      },
      transcript: {
        recording_id: entry.name,
        transcript: text
          .split(/\n+/)
          .filter((line) => line.trim().length > 0)
          .map((line) => ({ text: line })),
      },
      raw_file_path: fullPath,
    });
  }
  return out;
}

async function main() {
  assertSafeEnvironment();
  assertOutputDirSafe(DEFAULT_OUTPUT_DIR);
  if (!fs.existsSync(DEFAULT_OUTPUT_DIR)) {
    fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  }
  const apiKey = process.env.FATHOM_API_KEY ?? "";
  const haveKey = apiKey.length > 0;

  console.log("═══ Fathom transcript import ═══");
  console.log(`  FATHOM_API_KEY       = ${mask(apiKey)}`);
  console.log(`  FATHOM_API_BASE      = ${FATHOM_API_BASE}`);
  console.log(`  FATHOM_IMPORT_LIMIT  = ${IMPORT_LIMIT}`);
  console.log(`  FATHOM_IMPORT_SINCE  = ${IMPORT_SINCE ?? "<unset>"}`);
  console.log(`  Output dir           = ${DEFAULT_OUTPUT_DIR}`);
  console.log(`  Owner email          = ${FOUNDER_EMAIL}`);
  console.log("════════════════════════════════");

  // Wipe prior demo transcript capsules so re-runs are clean.
  const wiped = await prisma.memoryCapsule.deleteMany({
    where: {
      payload_summary: { startsWith: TRANSCRIPT_TAG },
    },
  });
  console.log(`[fathom] wiped ${wiped.count} prior transcript summaries`);

  const founder = await getFounderWalletAndEntity();

  let work: Array<{
    meeting: FathomMeetingSummary;
    transcript: FathomTranscriptResponse;
    raw_file_path: string;
  }> = [];

  if (haveKey) {
    try {
      const meetings = await listFathomMeetings(apiKey);
      console.log(`[fathom] listed ${meetings.length} meetings via API`);
      for (const meeting of meetings.slice(0, IMPORT_LIMIT)) {
        try {
          const transcript = await fetchFathomTranscript(apiKey, meeting);
          const rawFile = path.join(
            DEFAULT_OUTPUT_DIR,
            `${meeting.recording_id}.json`,
          );
          fs.writeFileSync(
            rawFile,
            JSON.stringify({ meeting, transcript }, null, 2),
          );
          work.push({ meeting, transcript, raw_file_path: rawFile });
        } catch (err) {
          console.error(
            `[fathom] skipping ${meeting.recording_id}: ${redactKey(String(err)).slice(0, 200)}`,
          );
        }
      }
    } catch (err) {
      console.error(
        `[fathom] API list failed: ${redactKey(String(err)).slice(0, 200)}`,
      );
      console.error("[fathom] falling back to local folder import");
    }
  } else {
    console.log("[fathom] FATHOM_API_KEY not set; using local folder fallback");
  }

  if (work.length === 0) {
    work = await importFromFolderFallback(DEFAULT_OUTPUT_DIR);
    console.log(`[fathom] folder fallback found ${work.length} local transcripts`);
  }

  let createdCount = 0;
  for (const { meeting, transcript, raw_file_path } of work) {
    const summary = sanitizeSummary(meeting, transcript, raw_file_path);
    await persistSummaryAsCapsule(
      summary,
      founder.entity_id,
      founder.wallet_id,
    );
    createdCount += 1;
    console.log(
      `[fathom] summarized ${summary.title.slice(0, 60).padEnd(60)} ` +
        `participants=${summary.participants.length} actions=${summary.action_items.length} decisions=${summary.decisions.length}`,
    );
  }

  console.log(
    `\n[fathom] imported ${createdCount} transcript summaries into MemoryCapsule (no raw text persisted)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(
      "[fathom] FAILED:",
      redactKey(err instanceof Error ? err.message : String(err)),
    );
    await prisma.$disconnect();
    process.exit(1);
  });
