// FILE: artifact-from-communication.ts
// PURPOSE: Communication is Otzar's OS. Given communication context, choose
//          what artifact the AI Teammate should work on (doc, slides, form,
//          care plan, financial pack, etc.) — not a fixed "always Google Doc".
//          Provider create is only used when a real rail exists; otherwise Twin
//          still claims the work honestly.
// CONNECTS TO: project-transcript-extract, twin-work-claim, project kickoff

import type { TwinWorkAccuracyClass } from "./twin-work-claim.service.js";
import {
  defaultAccuracyClassForContext,
  industryRoleArtifactBoost,
  resolveAccuracyPackPosture,
} from "./industry-accuracy-packs.js";

/** What Otzar decided the work product is. */
export type CommunicationArtifactKind =
  | "PROJECT_BRIEF"
  | "DECISION_MEMO"
  | "MEETING_NOTES"
  | "SLIDES"
  | "FORM"
  | "CARE_PLAN"
  | "INSURANCE_FORM"
  | "FINANCIAL_PACK"
  | "HANDOFF_PACKAGE"
  | "REQUIREMENTS"
  | "GENERIC_DOCUMENT";

/** Which provider rail can materialize it today (honest). */
export type ArtifactProviderTarget =
  | "google_docs"
  | "google_slides"
  | "none_claim_only";

export interface ArtifactChoice {
  kind: CommunicationArtifactKind;
  /** Human title Otzar would use for the work product. */
  title_label: string;
  provider_target: ArtifactProviderTarget;
  accuracy_class: TwinWorkAccuracyClass;
  confidence: number;
  reason: string;
  /** True when a provider create should run (not only Twin claim). */
  materialize_now: boolean;
  /** Phase D.1 — pack prior that influenced choice when applicable. */
  accuracy_pack_id?: string | null;
}

function score(text: string, re: RegExp): number {
  return re.test(text) ? 1 : 0;
}

// WHAT: Choose artifact kind from communication text (deterministic).
// WHY: The OS of Otzar is communication — work product follows context.
//      Phase D.1: optional industry + role_template soft-bias pack kinds
//      without overriding strong communication keywords.
export function chooseArtifactFromCommunication(args: {
  text: string;
  project_name?: string;
  /** OrgSettings.industry — soft bias for accuracy packs. */
  industry?: string | null;
  /** TwinConfig.role_template slug — soft bias for role-relevant packs. */
  role_template?: string | null;
}): ArtifactChoice {
  const t = `${args.text} ${args.project_name ?? ""}`.toLowerCase();

  // Accuracy first — more specific domains before broader clinical.
  // Text keywords always win over industry defaults.
  let accuracy: TwinWorkAccuracyClass = "STANDARD";
  let accuracyFromText = false;
  if (/\b(insurance|prior.?auth|claim form|payer|cms|benefits)\b/.test(t)) {
    accuracy = "INSURANCE";
    accuracyFromText = true;
  } else if (
    /\b(kyc|aml|financial|audit pack|sec filing|loan package|wire|compliance pack)\b/.test(
      t,
    )
  ) {
    accuracy = "REGULATED_FINANCE";
    accuracyFromText = true;
  } else if (
    /\b(phi|hipaa|patient|clinical|caretaker|care plan|nursing|medical record|ehr|clinic)\b/.test(
      t,
    )
  ) {
    accuracy = "REGULATED_HEALTH";
    accuracyFromText = true;
  }

  type Cand = {
    kind: CommunicationArtifactKind;
    label: string;
    provider: ArtifactProviderTarget;
    score: number;
    reason: string;
  };

  const industryBoost = (kind: CommunicationArtifactKind): number =>
    industryRoleArtifactBoost({
      kind,
      industry: args.industry,
      role_template: args.role_template,
    });

  const cands: Cand[] = [
    {
      kind: "CARE_PLAN",
      label: "Care plan",
      provider: "google_docs",
      score:
        score(t, /\bcare plan\b/) * 3 +
        score(t, /\bpatient care\b/) +
        score(t, /\bcaretaker\b/) +
        industryBoost("CARE_PLAN"),
      reason: "care_language",
    },
    {
      kind: "INSURANCE_FORM",
      label: "Insurance form",
      provider: "google_docs",
      score:
        score(t, /\binsurance\b/) * 2 +
        score(t, /\bprior.?auth\b/) * 3 +
        score(t, /\bclaim form\b/) * 3 +
        industryBoost("INSURANCE_FORM"),
      reason: "insurance_language",
    },
    {
      kind: "FINANCIAL_PACK",
      label: "Financial documentation pack",
      provider: "google_docs",
      score:
        score(t, /\bkyc\b/) * 3 +
        score(t, /\bfinancial (pack|documentation|docs)\b/) * 2 +
        score(t, /\bsec filing\b/) * 2 +
        industryBoost("FINANCIAL_PACK"),
      reason: "finance_language",
    },
    {
      kind: "FORM",
      label: "Form",
      provider: "google_docs",
      score:
        score(t, /\bform\b/) * 2 +
        score(t, /\bcomplete the form\b/) * 3 +
        score(t, /\bfill out\b/) * 2 +
        industryBoost("FORM"),
      reason: "form_language",
    },
    {
      kind: "SLIDES",
      label: "Slide deck",
      provider: "google_slides",
      score:
        score(t, /\bslides?\b/) * 3 +
        score(t, /\bdeck\b/) * 2 +
        score(t, /\bpresentation\b/) * 3 +
        score(t, /\bpitch\b/),
      reason: "slides_language",
    },
    {
      kind: "MEETING_NOTES",
      label: "Meeting notes",
      provider: "google_docs",
      score:
        score(t, /\bmeeting notes\b/) * 3 +
        score(t, /\bnotes from (the )?call\b/) * 2 +
        score(t, /\brecap\b/),
      reason: "notes_language",
    },
    {
      kind: "DECISION_MEMO",
      label: "Decision memo",
      provider: "google_docs",
      score:
        score(t, /\bdecision memo\b/) * 3 +
        score(t, /\bwrite up the decision\b/) * 2 +
        score(t, /\bdecision log\b/) * 2,
      reason: "decision_memo_language",
    },
    {
      kind: "REQUIREMENTS",
      label: "Requirements document",
      provider: "google_docs",
      score:
        score(t, /\brequirements?\b/) * 2 +
        score(t, /\bprd\b/) * 2 +
        score(t, /\bspec\b/),
      reason: "requirements_language",
    },
    {
      kind: "HANDOFF_PACKAGE",
      label: "Handoff package",
      provider: "google_docs",
      score:
        score(t, /\bhandoff\b/) * 3 +
        score(t, /\bhand[- ]off package\b/) * 3,
      reason: "handoff_language",
    },
    {
      kind: "PROJECT_BRIEF",
      label: "Project brief",
      provider: "google_docs",
      score:
        score(t, /\bbrief\b/) * 2 +
        score(t, /\bpilot\b/) +
        score(t, /\blaunch\b/) +
        score(t, /\bproject\b/),
      reason: "brief_or_project_language",
    },
  ];

  cands.sort((a, b) => b.score - a.score);
  const top = cands[0]!;
  // Default when communication implies durable written work without a keyword.
  // Industry packs alone must not force a regulated form when text is empty-ish.
  const textOnlyScore =
    top.score - industryBoost(top.kind);
  const chosen =
    top.score > 0 && (textOnlyScore > 0 || top.score >= 2)
      ? top
      : {
          kind: "GENERIC_DOCUMENT" as const,
          label: "Working document",
          provider: "google_docs" as const,
          score: 0.4,
          reason: "default_written_work_from_comms",
        };

  // When text did not set accuracy, inherit pack/industry prior for regulated kinds.
  if (!accuracyFromText) {
    const posture = resolveAccuracyPackPosture({
      industry: args.industry,
      role_template: args.role_template,
    });
    const matchingPack = posture.packs.find(
      (p) => p.artifact_kind === chosen.kind && p.relevance !== "available",
    );
    if (matchingPack) {
      accuracy = matchingPack.accuracy_class;
    } else if (
      chosen.kind === "CARE_PLAN" ||
      chosen.kind === "INSURANCE_FORM" ||
      chosen.kind === "FINANCIAL_PACK"
    ) {
      accuracy = defaultAccuracyClassForContext({
        industry: args.industry,
        role_template: args.role_template,
      });
      if (accuracy === "STANDARD") {
        if (chosen.kind === "CARE_PLAN") accuracy = "REGULATED_HEALTH";
        else if (chosen.kind === "INSURANCE_FORM") accuracy = "INSURANCE";
        else accuracy = "REGULATED_FINANCE";
      }
    }
  }

  const postureForPack = resolveAccuracyPackPosture({
    industry: args.industry,
    role_template: args.role_template,
  });
  const packId =
    postureForPack.packs.find((p) => p.artifact_kind === chosen.kind)?.pack_id ??
    null;

  const confidence = Math.min(0.95, 0.45 + chosen.score * 0.15);
  // Materialize only when we have a live provider rail.
  // Slides: claim-only until Google Slides create exists (honest OS).
  const materialize_now = chosen.provider === "google_docs";

  const reason =
    industryBoost(chosen.kind) > 0 && textOnlyScore <= 0
      ? `${chosen.reason}+industry_pack_prior`
      : chosen.reason;

  return {
    kind: chosen.kind,
    title_label: chosen.label,
    provider_target: chosen.provider,
    accuracy_class: accuracy,
    confidence,
    reason,
    materialize_now,
    accuracy_pack_id: packId,
  };
}

export function artifactKindToWorkKind(
  kind: CommunicationArtifactKind,
): "DOCUMENT" | "TASK" {
  if (kind === "SLIDES") return "DOCUMENT";
  return "DOCUMENT";
}
