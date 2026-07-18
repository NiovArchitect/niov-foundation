// FILE: wallet-portability.ts
// PURPOSE: Whole-system doctrine — employee memory wallet is portable across
//          orgs like a phone number between carriers: personal skills,
//          preferences, and corrections travel; org data, peer wallets, and
//          secrets never leave. Pure posture projection for My Twin (safe
//          labels only). Enforcement of export filters is separate.
// CONNECTS TO: getMyTwin sidecar, TwinCorrectionMemory, TwinSkill,
//              memory capsules (person-owned), OrgSettings.

export type WalletPortabilityClass =
  | "PORTABLE_PERSONAL"
  | "ORG_SCOPED"
  | "NEVER_EXPORT";

export interface WalletPortabilityBucket {
  class: WalletPortabilityClass;
  label: string;
  description: string;
  examples: string[];
}

export interface WalletPortabilityPosture {
  portable_summary: string;
  org_retained_summary: string;
  never_export_summary: string;
  buckets: WalletPortabilityBucket[];
  /** Product rule surface. */
  leaves_org_without_harm: true;
  takes_only_personal_layer: true;
}

const BUCKETS: readonly WalletPortabilityBucket[] = Object.freeze([
  {
    class: "PORTABLE_PERSONAL",
    label: "Travels with you",
    description:
      "Your AI Teammate skills, communication preferences, and corrections you taught it — personal layer only.",
    examples: [
      "Role template fit and personal skill preferences",
      "Correction memory (how you like summaries, tone, reminders)",
      "Personal calendar/style preferences you set",
    ],
  },
  {
    class: "ORG_SCOPED",
    label: "Stays with the organization",
    description:
      "Work product, projects, org knowledge, and team context remain in the enterprise source of truth.",
    examples: [
      "Work projects and ledger entries",
      "Org documents, care plans, KYC packs for this company",
      "Hierarchy, decision rights, and team collaborations",
    ],
  },
  {
    class: "NEVER_EXPORT",
    label: "Never leaves",
    description:
      "Secrets, peer wallets, other employees' data, and org credentials never transfer with you.",
    examples: [
      "Other people's twins and memory",
      "API keys, OAuth tokens, connector credentials",
      "Cross-tenant or client confidential data outside your personal scope",
    ],
  },
]);

// WHAT: Safe wallet-portability posture for employee surfaces.
// WHY: Founder doctrine — portable person identity without org exfiltration.
export function resolveWalletPortabilityPosture(): WalletPortabilityPosture {
  return {
    portable_summary:
      "When you move organizations, your personal AI Teammate layer can travel with you — skills and how you work, not company data.",
    org_retained_summary:
      "Projects, org documents, hierarchy, and team work stay with the enterprise you leave.",
    never_export_summary:
      "Credentials, peer data, and secrets never leave. The org is not harmed by your departure.",
    buckets: BUCKETS.map((b) => ({
      ...b,
      examples: [...b.examples],
    })),
    leaves_org_without_harm: true,
    takes_only_personal_layer: true,
  };
}

/** Substrate kinds that may appear in an export candidate list. */
export type WalletExportKind =
  | "twin_skill"
  | "correction_memory"
  | "personal_preference"
  | "role_template_fit"
  | "work_ledger"
  | "work_project"
  | "org_document"
  | "org_seed"
  | "hierarchy"
  | "oauth_token"
  | "api_key"
  | "connector_credential"
  | "peer_twin"
  | "peer_memory"
  | "other_employee_data";

export interface WalletExportCandidate {
  kind: WalletExportKind;
  /** Opaque id for audit — never secrets. */
  ref_id: string;
  label: string;
}

export interface WalletExportDecision {
  kind: WalletExportKind;
  ref_id: string;
  label: string;
  class: WalletPortabilityClass;
  /** True only when class is PORTABLE_PERSONAL. */
  include_in_export: boolean;
  reason: string;
}

const KIND_CLASS: Readonly<Record<WalletExportKind, WalletPortabilityClass>> =
  Object.freeze({
    twin_skill: "PORTABLE_PERSONAL",
    correction_memory: "PORTABLE_PERSONAL",
    personal_preference: "PORTABLE_PERSONAL",
    role_template_fit: "PORTABLE_PERSONAL",
    work_ledger: "ORG_SCOPED",
    work_project: "ORG_SCOPED",
    org_document: "ORG_SCOPED",
    org_seed: "ORG_SCOPED",
    hierarchy: "ORG_SCOPED",
    oauth_token: "NEVER_EXPORT",
    api_key: "NEVER_EXPORT",
    connector_credential: "NEVER_EXPORT",
    peer_twin: "NEVER_EXPORT",
    peer_memory: "NEVER_EXPORT",
    other_employee_data: "NEVER_EXPORT",
  });

const CLASS_REASON: Readonly<Record<WalletPortabilityClass, string>> =
  Object.freeze({
    PORTABLE_PERSONAL: "Personal AI Teammate layer — travels with the person.",
    ORG_SCOPED: "Enterprise work product — stays with the organization.",
    NEVER_EXPORT: "Secrets or peer data — never leave.",
  });

// WHAT: Classify one export candidate under wallet-portability doctrine.
// WHY: Enforcement substrate — UI posture alone is not enough.
export function classifyWalletExportItem(
  item: WalletExportCandidate,
): WalletExportDecision {
  const cls = KIND_CLASS[item.kind];
  return {
    kind: item.kind,
    ref_id: item.ref_id,
    label: item.label,
    class: cls,
    include_in_export: cls === "PORTABLE_PERSONAL",
    reason: CLASS_REASON[cls],
  };
}

// WHAT: Filter a candidate set to the portable personal layer only.
// WHY: Export packages must never include ORG_SCOPED or NEVER_EXPORT rows.
export function filterWalletExportPackage(
  candidates: readonly WalletExportCandidate[],
): {
  included: WalletExportDecision[];
  excluded: WalletExportDecision[];
  portable_count: number;
  org_retained_count: number;
  never_export_count: number;
} {
  const decisions = candidates.map(classifyWalletExportItem);
  const included = decisions.filter((d) => d.include_in_export);
  const excluded = decisions.filter((d) => !d.include_in_export);
  return {
    included,
    excluded,
    portable_count: included.length,
    org_retained_count: excluded.filter((d) => d.class === "ORG_SCOPED").length,
    never_export_count: excluded.filter((d) => d.class === "NEVER_EXPORT")
      .length,
  };
}
