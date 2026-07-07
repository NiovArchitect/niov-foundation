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
  | "OCR_GOOGLE_VISION"
  | "CIRCLE_GATEWAY"
  | "COINBASE_BASE"
  | "ELEVENLABS_TTS"
  | "ASSEMBLYAI_STT"
  | "OPENAI_REALTIME"
  | "TWILIO_VOICE"
  | "LIVEKIT"
  | "WHATSAPP_BUSINESS";

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
  /** Phase 1243 — plain-English setup steps the admin follows to
   *  activate this connector. Guidance only; never secrets. */
  setup_steps: string[];
  /** Phase 1243 — whether a mock/demo path exercises this
   *  connector's product flow without credentials. */
  demo_mode_available: boolean;
}

const ADAPTERS: ReadonlyArray<ConnectorAdapterDescriptor> = [
  {
    provider_name: "GOOGLE_WORKSPACE",
    setup_steps: [
      "Create a Google Cloud project for your organization.",
      "Configure the OAuth consent screen and submit Google's app verification (restricted scopes take ~6 weeks).",
      "Create OAuth credentials and provide the client ID and secret to your deployment.",
      "Grant per-employee scopes in Otzar — nothing is read or sent without them.",
      "Calendar event creation is approval-gated: it needs the calendar.events write scope (a re-consent) AND an explicit approval — Otzar never creates an event silently.",
    ],
    demo_mode_available: true,
    category: "PRODUCTIVITY",
    display_name: "Google Workspace",
    description:
      "Calendar, Drive, Gmail context. Read-only by default. Sending requires per-action approval.",
    required_envs: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    oauth_scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      // [GOOGLE-DOCS] drive.readonly: content read for the SELECTED-DOC
      // import rail (one admin-chosen doc at a time; never an auto-sync).
      "https://www.googleapis.com/auth/drive.readonly",
      // [GOOGLE-MEET] post-meeting conference records + transcripts.
      "https://www.googleapis.com/auth/meetings.space.readonly",
      // [CALENDAR-WRITE] approval-gated event create/update/delete.
      "https://www.googleapis.com/auth/calendar.events",
    ],
    setup_docs_url:
      "https://console.cloud.google.com/apis/credentials (create OAuth 2.0 client + verified consent screen)",
    app_review_required: true,
    can_write: true,
    phase: 1224,
  },
  {
    provider_name: "SLACK",
    setup_steps: [
      "Create a Slack app in your workspace's API portal.",
      "Add the client ID, client secret, and signing secret to your deployment.",
      "Install the app to your workspace and approve the requested scopes.",
      "Sends remain approval-gated inside Otzar even after connection.",
    ],
    demo_mode_available: true,
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
    setup_steps: [
      "Register an application in your Microsoft Entra admin center.",
      "Provide the Graph client ID, client secret, and tenant ID to your deployment.",
      "Grant admin consent for the requested Graph scopes.",
      "Sends remain approval-gated inside Otzar even after connection.",
    ],
    demo_mode_available: true,
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
    setup_steps: [
      "Create a Zoom Marketplace app for your account.",
      "Provide the OAuth client ID and secret to your deployment.",
      "Complete Zoom's app review if you publish beyond your account.",
      "Recording ingest activates only with participant consent in Otzar.",
    ],
    demo_mode_available: true,
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
    setup_steps: [
      "Create an Atlassian OAuth app.",
      "Provide the client credentials to your deployment.",
      "Ticket creation stays draft-only until policy approves sends.",
    ],
    demo_mode_available: false,
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
    setup_steps: [
      "Create a GitHub App or OAuth app for your organization.",
      "Provide the client credentials to your deployment.",
      "Writes stay approval-gated inside Otzar.",
    ],
    demo_mode_available: false,
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
    setup_steps: [
      "Create a Linear OAuth app.",
      "Provide the client credentials to your deployment.",
      "Writes stay approval-gated inside Otzar.",
    ],
    demo_mode_available: false,
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
    setup_steps: [
      "Provide your SMTP gateway host, port, and credentials to your deployment.",
      "Send a test message to yourself from the connector check.",
      "Outbound email remains approval-gated per recipient.",
    ],
    demo_mode_available: true,
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
    setup_steps: [
      "No credentials needed — local reading installs with a future build update.",
      "Until then, pasted text and the built-in sample exercise the same flow.",
    ],
    demo_mode_available: true,
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
    setup_steps: [
      "Provide AWS access key, secret, and region to your deployment.",
      "Reading is per-document billed by AWS.",
    ],
    demo_mode_available: true,
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
    setup_steps: [
      "Provide a Google Cloud Vision API key to your deployment.",
    ],
    demo_mode_available: true,
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
  {
    provider_name: "ELEVENLABS_TTS",
    category: "AI",
    display_name: "ElevenLabs (production voice output)",
    description:
      "High-quality, low-latency text-to-speech (~75ms). The recommended first paid voice-output seat per the verified voice provider recommendation.",
    required_envs: ["ELEVENLABS_API_KEY"],
    oauth_scopes: [],
    setup_docs_url: "https://elevenlabs.io/docs",
    app_review_required: false,
    can_write: false,
    phase: 1249,
    setup_steps: [
      "Create an ElevenLabs account and provide the API key to your deployment.",
      "Until then, browser/device voice output works everywhere as the fallback.",
    ],
    demo_mode_available: true,
  },
  {
    provider_name: "ASSEMBLYAI_STT",
    category: "AI",
    display_name: "AssemblyAI (meeting diarization)",
    description:
      "Streaming speech-to-text with speaker attribution — the recommended meeting-intelligence seat.",
    required_envs: ["ASSEMBLYAI_API_KEY"],
    oauth_scopes: [],
    setup_docs_url: "https://www.assemblyai.com/docs",
    app_review_required: false,
    can_write: false,
    phase: 1249,
    setup_steps: [
      "Create an AssemblyAI account and provide the API key to your deployment.",
      "Until then, manual transcripts and browser voice exercise the same meeting pipeline.",
    ],
    demo_mode_available: true,
  },
  {
    provider_name: "OPENAI_REALTIME",
    category: "AI",
    display_name: "OpenAI Realtime (natural conversation)",
    description:
      "Native speech-to-speech with true interruption handling — the recommended seat for fully natural voice conversation.",
    required_envs: ["OPENAI_API_KEY"],
    oauth_scopes: [],
    setup_docs_url: "https://platform.openai.com/docs",
    app_review_required: false,
    can_write: false,
    phase: 1249,
    setup_steps: [
      "Provide an OpenAI API key to your deployment.",
      "Voice still confirms governed actions before anything executes — speech never bypasses approval.",
    ],
    demo_mode_available: true,
  },
  {
    provider_name: "CIRCLE_GATEWAY",
    category: "SETTLEMENT",
    display_name: "Circle (USDC settlement rail)",
    description:
      "USDC settlement via Circle. Architecture prepared per ADR-0094 (GATS) — Foundation proves the transaction was allowed; the rail moves funds. Implementation is gated on explicit Founder authorization.",
    required_envs: ["CIRCLE_API_KEY"],
    oauth_scopes: [],
    setup_docs_url: "https://developers.circle.com/",
    app_review_required: false,
    can_write: false,
    phase: 1247,
    setup_steps: [
      "Settlement remains deliberately last — Foundation's governance substrate is what proves a transaction was allowed.",
      "Create a Circle developer account and provide the API key to your deployment.",
      "Every settlement intent will require policy evaluation, dual-control approval, and audit before any rail call fires (per ADR-0094).",
      "No funds move and no keys are handled until the Founder explicitly authorizes the implementation phase.",
    ],
    demo_mode_available: false,
  },
  {
    provider_name: "COINBASE_BASE",
    category: "SETTLEMENT",
    display_name: "Coinbase Base (on-chain settlement rail)",
    description:
      "On-chain settlement and receipt anchoring via Coinbase CDP / Base. Architecture prepared per ADR-0094 (GATS). Implementation is gated on explicit Founder authorization.",
    required_envs: ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET"],
    oauth_scopes: [],
    setup_docs_url: "https://docs.cdp.coinbase.com/",
    app_review_required: false,
    can_write: false,
    phase: 1247,
    setup_steps: [
      "Settlement remains deliberately last — Foundation's governance substrate is what proves a transaction was allowed.",
      "Create a Coinbase Developer Platform project and provide the API key pair to your deployment.",
      "Every settlement intent will require policy evaluation, dual-control approval, and audit before any rail call fires (per ADR-0094).",
      "No funds move, no private keys are handled, and no transactions are submitted until the Founder explicitly authorizes the implementation phase.",
    ],
    demo_mode_available: false,
  },
  // ── Phase 1254 — Otzar Work Comms providers (design slice). ──
  // Employer-scoped, CONSENTED work communication only. Personal
  // WhatsApp monitoring is NOT supported and will not be built; the
  // WHATSAPP_BUSINESS entry is the official Meta Business API path
  // only. See docs/otzar/WORK_COMMS_DESIGN.md.
  {
    provider_name: "TWILIO_VOICE",
    category: "COMMUNICATIONS",
    display_name: "Twilio (work voice / SMS / number verification)",
    description:
      "Work-line calling, SMS, and phone-number OTP verification for Otzar Work Comms. Consent-first: capture requires participant consent per org policy.",
    required_envs: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    oauth_scopes: [],
    setup_docs_url: "https://www.twilio.com/docs/voice",
    app_review_required: false,
    can_write: false,
    phase: 1254,
    setup_steps: [
      "Create a Twilio account and provision a work number for the org.",
      "Provide the Account SID + Auth Token to your deployment.",
      "Every outbound call/SMS rides a governed Action with approval; transcripts require participant consent.",
    ],
    demo_mode_available: false,
  },
  {
    provider_name: "LIVEKIT",
    category: "COMMUNICATIONS",
    display_name: "LiveKit (app-native work calls)",
    description:
      "WebRTC rooms for app-native Otzar Work Comms calls with visible capture indicators and consent state.",
    required_envs: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_URL"],
    oauth_scopes: [],
    setup_docs_url: "https://docs.livekit.io/",
    app_review_required: false,
    can_write: false,
    phase: 1254,
    setup_steps: [
      "Create a LiveKit Cloud project (or self-host) and provide the key pair + URL.",
      "Calls show a visible capture indicator; transcription requires consent per org policy.",
    ],
    demo_mode_available: false,
  },
  {
    provider_name: "WHATSAPP_BUSINESS",
    category: "COMMUNICATIONS",
    display_name: "WhatsApp Business (official Meta API only)",
    description:
      "OFFICIAL Meta WhatsApp Business messaging for org business numbers, where Meta's API and policies permit. Personal WhatsApp monitoring is NOT supported and will not be built.",
    required_envs: ["WHATSAPP_BUSINESS_TOKEN", "WHATSAPP_BUSINESS_PHONE_ID"],
    oauth_scopes: [],
    setup_docs_url: "https://developers.facebook.com/docs/whatsapp",
    app_review_required: true,
    can_write: false,
    phase: 1254,
    setup_steps: [
      "Create a Meta Business + WhatsApp Business account and pass Meta's app review.",
      "Business-number messaging only — consented, policy-bound, audited.",
      "Personal WhatsApp calls/messages are out of scope by design.",
    ],
    demo_mode_available: false,
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
