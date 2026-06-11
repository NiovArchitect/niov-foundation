// FILE: connector-adapter-registry.ts
// PURPOSE: Phase 1224 / 1225 / 1226 / 1227 — provider-adapter
//          registry for the external connectors (Google Workspace
//          / Slack / Microsoft 365 / Zoom / Jira / GitHub / Linear
//          / SMTP email / OCR providers). Each adapter declares
//          its provider_name, required env credentials, OAuth
//          scopes, and a status() function that reports
//          BLOCKED_BY_CREDENTIAL / CONFIGURED / DISABLED without
//          touching any external API.
//
//          This registry is the CT-visible source of truth for
//          "what's connected" and "what's blocked on
//          credentials." Real OAuth + write paths land in
//          phase-specific follow-ons; the registry exists so the
//          admin can SEE the gap before any code ships.
//
// PRIVACY (RULE 0):
//   - The status function reads env-var PRESENCE only. NEVER
//     log the env-var value (RULE 16 + the no-leak guard).
//   - Required scopes are documented, NEVER auto-requested.

export type ConnectorProviderName =
  | "GOOGLE_WORKSPACE"
  | "SLACK"
  | "MICROSOFT_365"
  | "ZOOM"
  | "JIRA"
  | "GITHUB"
  | "LINEAR"
  | "SMTP_EMAIL"
  | "OCR_TESSERACT"
  | "OCR_AWS_TEXTRACT"
  | "OCR_GOOGLE_VISION";

export type ConnectorProviderCategory =
  | "PRODUCTIVITY"
  | "COMMUNICATIONS"
  | "ENGINEERING"
  | "AI"
  | "SETTLEMENT";

export type ConnectorProviderStatus =
  | "CONFIGURED"
  | "BLOCKED_BY_CREDENTIAL"
  | "BLOCKED_BY_APP_REVIEW"
  | "DISABLED"
  | "ERROR";

export interface ConnectorAdapterDescriptor {
  provider_name: ConnectorProviderName;
  category: ConnectorProviderCategory;
  display_name: string;
  description: string;
  /** OAuth or API key env vars the runtime reads to activate
   *  this adapter. Status is CONFIGURED only when ALL are set. */
  required_envs: string[];
  /** OAuth scopes the runtime requests when the adapter
   *  performs read or send actions. NEVER auto-granted. */
  oauth_scopes: string[];
  /** Documentation pointer for the operator. */
  setup_docs_url?: string;
  /** App-review requirement (e.g. Google verified scopes,
   *  Slack Marketplace review). */
  app_review_required?: boolean;
  /** Whether the runtime CAN send/write to this provider once
   *  credentials are present. Default false until wired. */
  can_write: boolean;
  /** Phase that introduces this adapter (for the readiness
   *  matrix). */
  phase: number;
}

const ADAPTERS: ReadonlyArray<ConnectorAdapterDescriptor> = [
  {
    provider_name: "GOOGLE_WORKSPACE",
    category: "PRODUCTIVITY",
    display_name: "Google Workspace",
    description:
      "Calendar, Drive, Gmail context. Read-only by default. Sending requires per-action approval.",
    required_envs: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    oauth_scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    setup_docs_url:
      "https://console.cloud.google.com/apis/credentials (create OAuth 2.0 client + verified consent screen)",
    app_review_required: true,
    can_write: false,
    phase: 1224,
  },
  {
    provider_name: "SLACK",
    category: "COMMUNICATIONS",
    display_name: "Slack",
    description:
      "Channel + DM context. Sending requires per-action approval and per-channel scope grant.",
    required_envs: [
      "SLACK_CLIENT_ID",
      "SLACK_CLIENT_SECRET",
      "SLACK_SIGNING_SECRET",
    ],
    oauth_scopes: [
      "channels:read",
      "channels:history",
      "users:read",
      "chat:write",
    ],
    setup_docs_url: "https://api.slack.com/apps (create app + install in workspace)",
    app_review_required: true,
    can_write: false,
    phase: 1225,
  },
  {
    provider_name: "MICROSOFT_365",
    category: "PRODUCTIVITY",
    display_name: "Microsoft 365",
    description:
      "Outlook, Teams, OneDrive context via Microsoft Graph API. Sending requires approval.",
    required_envs: [
      "MICROSOFT_GRAPH_CLIENT_ID",
      "MICROSOFT_GRAPH_CLIENT_SECRET",
      "MICROSOFT_GRAPH_TENANT_ID",
    ],
    oauth_scopes: [
      "Mail.Read",
      "Calendars.Read",
      "Files.Read.All",
      "User.Read",
    ],
    setup_docs_url:
      "https://portal.azure.com Active Directory > App registrations",
    app_review_required: true,
    can_write: false,
    phase: 1226,
  },
  {
    provider_name: "ZOOM",
    category: "COMMUNICATIONS",
    display_name: "Zoom",
    description:
      "Cloud recording transcripts via Zoom API. Read-only ingest.",
    required_envs: ["ZOOM_OAUTH_CLIENT_ID", "ZOOM_OAUTH_CLIENT_SECRET"],
    oauth_scopes: ["recording:read"],
    setup_docs_url: "https://marketplace.zoom.us/develop/create",
    app_review_required: true,
    can_write: false,
    phase: 1222,
  },
  {
    provider_name: "JIRA",
    category: "ENGINEERING",
    display_name: "Jira (Atlassian)",
    description:
      "Issue tracking context. Sending a ticket requires per-action approval.",
    required_envs: ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"],
    oauth_scopes: ["read:jira-work", "write:jira-work"],
    setup_docs_url:
      "https://developer.atlassian.com/console/myapps/ (create OAuth 2.0)",
    app_review_required: false,
    can_write: false,
    phase: 1224,
  },
  {
    provider_name: "GITHUB",
    category: "ENGINEERING",
    display_name: "GitHub",
    description:
      "Repo + issue + PR context. Sending comments / PRs requires per-action approval.",
    required_envs: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"],
    oauth_scopes: ["repo", "read:org", "read:user"],
    setup_docs_url:
      "https://github.com/settings/apps (create GitHub App + install in org)",
    app_review_required: false,
    can_write: false,
    phase: 1224,
  },
  {
    provider_name: "LINEAR",
    category: "ENGINEERING",
    display_name: "Linear",
    description: "Linear issues + projects context.",
    required_envs: ["LINEAR_OAUTH_CLIENT_ID", "LINEAR_OAUTH_CLIENT_SECRET"],
    oauth_scopes: ["read", "write"],
    setup_docs_url: "https://linear.app/settings/api/applications",
    app_review_required: false,
    can_write: false,
    phase: 1224,
  },
  {
    provider_name: "SMTP_EMAIL",
    category: "COMMUNICATIONS",
    display_name: "SMTP email",
    description:
      "Outbound email via SMTP gateway. Send requires per-action approval.",
    required_envs: [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USERNAME",
      "SMTP_PASSWORD",
    ],
    oauth_scopes: [],
    setup_docs_url:
      "Configure SMTP credentials in the operator vault (per ADR-0089).",
    app_review_required: false,
    can_write: false,
    phase: 1226,
  },
  {
    provider_name: "OCR_TESSERACT",
    category: "AI",
    display_name: "Tesseract.js (local OCR)",
    description:
      "Local OCR via Tesseract.js. No credentials required; runs in-process. Defaults to DISABLED until binary is bundled.",
    required_envs: [],
    oauth_scopes: [],
    setup_docs_url: "https://github.com/naptha/tesseract.js",
    app_review_required: false,
    can_write: false,
    phase: 1227,
  },
  {
    provider_name: "OCR_AWS_TEXTRACT",
    category: "AI",
    display_name: "AWS Textract",
    description: "Cloud OCR via AWS Textract. Per-document billing.",
    required_envs: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    oauth_scopes: [],
    setup_docs_url: "https://aws.amazon.com/textract/",
    app_review_required: false,
    can_write: false,
    phase: 1227,
  },
  {
    provider_name: "OCR_GOOGLE_VISION",
    category: "AI",
    display_name: "Google Cloud Vision",
    description: "Cloud OCR via Google Cloud Vision API.",
    required_envs: ["GOOGLE_CLOUD_VISION_API_KEY"],
    oauth_scopes: [],
    setup_docs_url: "https://cloud.google.com/vision/docs/setup",
    app_review_required: false,
    can_write: false,
    phase: 1227,
  },
];

function hasAllEnvs(envs: string[]): boolean {
  if (envs.length === 0) return false; // adapters with no env vars stay DISABLED until wired
  return envs.every((k) => {
    const v = process.env[k];
    return v !== undefined && v.length > 0;
  });
}

export interface ConnectorAdapterStatusRow extends ConnectorAdapterDescriptor {
  status: ConnectorProviderStatus;
  /** Which envs are missing (when status is BLOCKED_BY_CREDENTIAL). */
  missing_envs: string[];
}

export function listConnectorAdapters(): ConnectorAdapterStatusRow[] {
  return ADAPTERS.map((a) => {
    const missing = a.required_envs.filter((k) => {
      const v = process.env[k];
      return v === undefined || v.length === 0;
    });
    let status: ConnectorProviderStatus;
    if (a.required_envs.length === 0) {
      status = "DISABLED";
    } else if (missing.length === 0) {
      // Even when all envs are set, send is gated by app_review.
      status = a.app_review_required === true ? "BLOCKED_BY_APP_REVIEW" : "CONFIGURED";
    } else {
      status = "BLOCKED_BY_CREDENTIAL";
    }
    return { ...a, status, missing_envs: missing };
  });
}

export function getConnectorAdapter(
  name: ConnectorProviderName,
): ConnectorAdapterStatusRow | null {
  return listConnectorAdapters().find((a) => a.provider_name === name) ?? null;
}
