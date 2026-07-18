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
