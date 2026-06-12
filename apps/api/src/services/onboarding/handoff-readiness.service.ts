// FILE: handoff-readiness.service.ts
// PURPOSE: Phase 1242 — the enterprise handoff readiness aggregate.
//          One admin-scoped, truthful answer to "can this org be
//          handed to a real enterprise client, and exactly what is
//          live vs blocked?" Aggregates EXISTING substrate — the
//          Phase 1230 checklist, the Phase 1224-1227 connector
//          registry, the STT/OCR provider adapters, the Phase 1241
//          BEAM probe, runtime env presence — plus the pending
//          additive schema diff that awaits the Founder's explicit
//          APPROVE PROD SCHEMA PUSH.
//
// SAFETY POSTURE:
//   - Admin-gated (clearance >= 4, Phase 1230 convention).
//   - NO secrets, NO env values — only boolean presence + closed
//     vocab. Connector rows surface required env NAMES (setup
//     guidance), never values.
//   - Org-scoped; no cross-org data.
//
// CONNECTS TO:
//   - apps/api/src/services/onboarding/onboarding.service.ts
//     (Phase 1230 checklist — org/policy/DMW/COSMP steps)
//   - apps/api/src/services/connectors/connector-adapter-registry.ts
//   - apps/api/src/services/voice/stt-provider.ts
//   - apps/api/src/services/otzar/ocr-provider.ts
//   - apps/api/src/services/coordination/
//     beam-collaboration-supervisor.service.ts (Phase 1241 probe)
//   - apps/api/src/routes/onboarding.routes.ts (route registration)
//   - docs/operations/client-handoff-readiness-matrix.md (the
//     human-maintained mirror of CAPABILITY_TRUTH below)

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import {
  getOnboardingChecklistForCaller,
  type OnboardingChecklist,
} from "./onboarding.service.js";
import { listConnectorAdapters } from "../connectors/connector-adapter-registry.js";
import { listSTTProviderStatuses } from "../voice/stt-provider.js";
import { listOCRProviderStatuses } from "../otzar/ocr-provider.js";
import { getBeamRuntimeStatus } from "../coordination/beam-collaboration-supervisor.service.js";

type Failure = { ok: false; code: string };

export type CapabilityClass =
  | "PROD"
  | "PROD_READY_PENDING_SCHEMA_PUSH"
  | "PROD_READY_PENDING_CREDENTIALS"
  | "BLOCKED_BY_CREDENTIALS"
  | "BLOCKED_BY_APP_REVIEW"
  | "DEMO_ONLY"
  | "PARTIAL"
  | "NOT_STARTED";

export const CAPABILITY_CLASSES: readonly CapabilityClass[] = [
  "PROD",
  "PROD_READY_PENDING_SCHEMA_PUSH",
  "PROD_READY_PENDING_CREDENTIALS",
  "BLOCKED_BY_CREDENTIALS",
  "BLOCKED_BY_APP_REVIEW",
  "DEMO_ONLY",
  "PARTIAL",
  "NOT_STARTED",
] as const;

export interface CapabilityRow {
  capability: string;
  classification: CapabilityClass;
  /** Plain-English admin note. */
  note: string;
}

// The code-maintained capability truth table. The readiness matrix
// doc is the human-maintained mirror; tests lock the closed vocab.
// UPDATE BOTH when a phase changes a capability's classification.
export const CAPABILITY_TRUTH: readonly CapabilityRow[] = [
  { capability: "Notes, replies & Action Center", classification: "PROD", note: "Live end-to-end with full audit." },
  { capability: "My Day intelligence", classification: "PROD", note: "Built-in ranking always works; the intelligence service activates when its address is configured." },
  { capability: "Ambient shell & quiet mode", classification: "PROD", note: "Quiet mode is manual today and automatic once a calendar is connected." },
  { capability: "Calendar-aware quiet mode", classification: "PROD", note: "Works from scheduled meeting captures today; Google/Microsoft calendar connections make it fully automatic." },
  { capability: "Dandelion org growth & welcome", classification: "PROD", note: "Growth suggestions and consent-gated onboarding memory are live." },
  { capability: "AI Employees", classification: "PROD", note: "Provisioning, boundaries, and the deactivation kill switch are live." },
  { capability: "Twin collaboration", classification: "PROD", note: "Governed end-to-end; sensitive requests require approval." },
  { capability: "BEAM coordination", classification: "PROD", note: "Live status surfaces are in place; the runtime activates by deployment configuration." },
  { capability: "Collaboration Workspaces & external stakeholders", classification: "PROD_READY_PENDING_SCHEMA_PUSH", note: "Fully built and tested; goes live with the pending production schema update." },
  { capability: "Meeting capture (manual & API ingest)", classification: "PROD_READY_PENDING_SCHEMA_PUSH", note: "Fully built and tested; goes live with the pending production schema update." },
  { capability: "Voice capture & transcription", classification: "PROD_READY_PENDING_SCHEMA_PUSH", note: "Sample and browser paths always work; Whisper/Deepgram activate with keys after the schema update." },
  { capability: "Observe (let Otzar read documents)", classification: "PROD_READY_PENDING_SCHEMA_PUSH", note: "Sample and pasted-text reading work end-to-end; goes live with the pending schema update." },
  { capability: "Compliance share packages (regulator sharing)", classification: "PROD_READY_PENDING_SCHEMA_PUSH", note: "Purpose-bound, redacted, revocable regulator views; goes live with the pending schema update." },
  { capability: "Onboarding checklist & admin readiness", classification: "PROD_READY_PENDING_SCHEMA_PUSH", note: "The checklist works now; persistence goes live with the pending schema update." },
  { capability: "Live Google Meet / Zoom / Teams auto-ingest", classification: "BLOCKED_BY_CREDENTIALS", note: "Manual transcript upload exercises the full pipeline today." },
  { capability: "Google Workspace / Gmail / Calendar", classification: "BLOCKED_BY_APP_REVIEW", note: "Needs the organization's Google Cloud setup and Google's app verification." },
  { capability: "Slack / Microsoft 365 / Zoom connectors", classification: "BLOCKED_BY_CREDENTIALS", note: "Setup paths and status are ready; each needs the organization's app credentials." },
  { capability: "Governed transaction substrate (intent → policy → approval → proof)", classification: "PROD", note: "Live on the current schema (Phase 1250): DMW actors propose, policy gates by amount and actor class, humans approve (dual control above $1,000), and every step is audit-chained. AI, device, and machine actors never auto-approve." },
  { capability: "Mock settlement rail (development/demo)", classification: "DEMO_ONLY", note: "The only executable rail. Produces clearly-labeled mock receipts — settles nothing, moves no funds, handles no keys." },
  { capability: "Otzar Work Comms (employer-scoped, consented)", classification: "NOT_STARTED", note: "Designed (Phase 1254: docs/otzar/WORK_COMMS_DESIGN.md): phone-linked work identity, multi-employer isolation, consent-gated transcripts, BEAM realtime substrate. Personal WhatsApp monitoring is NOT supported and will not be built; official WhatsApp Business API is the only WhatsApp path. Needs Founder-authorized additive schema + provider credentials (Twilio/LiveKit)." },
  { capability: "Circle / Base / USDC settlement", classification: "BLOCKED_BY_CREDENTIALS", note: "Architecture prepared (ADR-0094 governed-transaction standard; Circle + Base rail adapters registered with honest blockers). No funds move and nothing is wired until the Founder explicitly authorizes implementation and credentials exist." },
] as const;

export interface HandoffReadinessView {
  headline: string;
  org: {
    checklist_steps_ready: number;
    checklist_steps_total: number;
    mode: string;
  };
  runtimes: Array<{
    runtime: string;
    status: "CONFIGURED" | "FALLBACK_AVAILABLE" | "NOT_CONFIGURED";
    note: string;
  }>;
  connectors: Array<{
    provider: string;
    display_name: string;
    status: string;
    required_envs: string[];
    app_review_required: boolean;
  }>;
  schema: {
    pending_push: boolean;
    pending_tables: string[];
    approval_phrase: string;
    note: string;
  };
  demo_prod_separation: {
    mode: string;
    note: string;
  };
  audit_compliance: {
    audit_chain: "LIVE";
    share_packages: CapabilityClass;
    note: string;
  };
  capabilities: CapabilityRow[];
  generated_at: string;
}

/** The pending additive production schema diff. Mirror of the
 *  readiness matrix §production schema migration. UPDATE when a
 *  schema-bearing phase lands. */
export const PENDING_SCHEMA_TABLES: readonly string[] = [
  "collaboration_workspaces",
  "collaboration_memberships",
  "collaboration_decisions",
  "collaboration_commitments",
  "collaboration_shared_context",
  "external_collaborators",
  "workspace_external_memberships",
  "external_commitments",
  "meeting_captures",
  "meeting_participant_consents",
  "audio_captures",
  "transcript_segments",
  "org_onboarding_states",
  "compliance_share_packages",
  "observe_captures",
] as const;

export const APPROVAL_PHRASE = "APPROVE PROD SCHEMA PUSH";

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

// WHAT: Headline for the admin readiness surface.
// WHY: One calm sentence the admin can repeat to their stakeholders.
export function readinessHeadline(input: {
  checklistReady: number;
  checklistTotal: number;
  pendingSchema: boolean;
}): string {
  if (input.pendingSchema) {
    return `Your organization is ready for a full internal demo today. ${input.checklistReady} of ${input.checklistTotal} setup steps are complete; the production schema update is waiting for your approval.`;
  }
  return `Your organization is production-ready. ${input.checklistReady} of ${input.checklistTotal} setup steps are complete.`;
}

export async function getHandoffReadinessForCaller(
  callerEntityId: string,
): Promise<{ ok: true; readiness: HandoffReadinessView } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  void orgEntityId;
  const caller = await prisma.entity.findUnique({
    where: { entity_id: callerEntityId },
    select: { clearance_level: true },
  });
  if (caller === null || caller.clearance_level < 4) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }

  const checklistResult = await getOnboardingChecklistForCaller(
    callerEntityId,
  );
  let checklist: OnboardingChecklist | null = null;
  if (checklistResult.ok === true) checklist = checklistResult.checklist;
  const stepsTotal = checklist?.steps.length ?? 0;
  const stepsReady =
    checklist?.steps.filter((s) => s.status === "READY").length ?? 0;
  const mode = checklist?.mode ?? "DEMO";

  const beam = await getBeamRuntimeStatus();
  const sttRows = listSTTProviderStatuses();
  const sttConfigured = sttRows.some((r) => r.status === "CONFIGURED");
  const ocrRows = listOCRProviderStatuses();

  const runtimes: HandoffReadinessView["runtimes"] = [
    {
      runtime: "Language intelligence (LLM)",
      status:
        envPresent("ANTHROPIC_API_KEY") || envPresent("OPENAI_API_KEY")
          ? "CONFIGURED"
          : "NOT_CONFIGURED",
      note:
        envPresent("ANTHROPIC_API_KEY") || envPresent("OPENAI_API_KEY")
          ? "A language model provider is configured."
          : "No language model key is configured; scripted demo modes still work.",
    },
    {
      runtime: "Otzar intelligence service (ranking)",
      status: envPresent("PYTHON_INTELLIGENCE_RUNTIME_URL")
        ? "CONFIGURED"
        : "FALLBACK_AVAILABLE",
      note: envPresent("PYTHON_INTELLIGENCE_RUNTIME_URL")
        ? "The intelligence service is configured."
        : "Built-in ranking is serving My Day; point the intelligence service address to upgrade.",
    },
    {
      runtime: "BEAM coordination",
      status:
        beam.collaboration_supervisor === "ACTIVE"
          ? "CONFIGURED"
          : "FALLBACK_AVAILABLE",
      note: beam.note,
    },
    {
      runtime: "Voice input (speech-to-text)",
      status: sttConfigured ? "CONFIGURED" : "FALLBACK_AVAILABLE",
      note: sttConfigured
        ? "A production speech provider is configured."
        : "Sample and browser voice paths work today; connect Deepgram or Whisper for production voice input.",
    },
    {
      runtime: "Document reading (OCR)",
      status: ocrRows.some(
        (r) => r.status === "READY" && r.provider !== "PLAIN_TEXT",
      )
        ? "CONFIGURED"
        : "FALLBACK_AVAILABLE",
      note: "Pasted text and the built-in sample always work; cloud reading activates with provider setup.",
    },
    {
      runtime: "Meeting capture",
      status: "FALLBACK_AVAILABLE",
      note: "Manual transcript capture works end-to-end today; live auto-ingest activates with meeting connectors.",
    },
  ];

  const connectors = listConnectorAdapters().map((c) => ({
    provider: c.provider_name,
    display_name: c.display_name,
    status: c.status,
    required_envs: c.required_envs,
    app_review_required: c.app_review_required === true,
  }));

  return {
    ok: true,
    readiness: {
      headline: readinessHeadline({
        checklistReady: stepsReady,
        checklistTotal: stepsTotal,
        pendingSchema: true,
      }),
      org: {
        checklist_steps_ready: stepsReady,
        checklist_steps_total: stepsTotal,
        mode,
      },
      runtimes,
      connectors,
      schema: {
        pending_push: true,
        pending_tables: [...PENDING_SCHEMA_TABLES],
        approval_phrase: APPROVAL_PHRASE,
        note: "The pending update is additive only — no existing data changes. It requires the Founder's explicit approval phrase before it touches production.",
      },
      demo_prod_separation: {
        mode,
        note:
          mode === "PRODUCTION"
            ? "Production mode — demo seed flows are gated off."
            : "Demo mode — demo data is clearly marked and production is untouched.",
      },
      audit_compliance: {
        audit_chain: "LIVE",
        share_packages: "PROD_READY_PENDING_SCHEMA_PUSH",
        note: "Every action is recorded in the tamper-evident audit trail. Regulator share packages go live with the schema update.",
      },
      capabilities: [...CAPABILITY_TRUTH],
      generated_at: new Date().toISOString(),
    },
  };
}
