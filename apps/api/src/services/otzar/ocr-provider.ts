// FILE: ocr-provider.ts
// PURPOSE: Phase 1227 — provider adapter for OCR / document text
//          extraction. Mirrors the Phase 1223 STT provider pattern:
//          a closed-vocab provider registry where DEMO_FIXTURE and
//          PLAIN_TEXT always work (no credentials, no new
//          dependencies), TESSERACT_LOCAL is honestly marked
//          NEEDS_PROVIDER_INSTALL until its dependency lands through
//          a RULE 21 research arc, and the cloud providers
//          (AWS_TEXTRACT / GOOGLE_VISION) are BLOCKED_BY_KEY until
//          their credentials are configured.
//
//          No provider here performs real image OCR yet — this slice
//          ships the adapter + always-working text paths so the
//          governed Observe pipeline (observe-intake.service.ts) is
//          end-to-end today and real OCR engines activate later by
//          provider swap, not redesign.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/observe-intake.service.ts (consumer)
//   - apps/api/src/services/connectors/connector-adapter-registry.ts
//     (the Phase 1224-1227 connector registry rows for the same
//     three real OCR providers; this module is the runtime adapter,
//     the registry is the setup/credential catalogue)
//   - apps/api/src/services/voice/stt-provider.ts (pattern mirror)
//   - tests/unit/ocr-provider.test.ts

import type { OCRProviderType } from "@prisma/client";

export type OCRProviderStatusValue =
  | "READY"
  | "DEMO_ONLY"
  | "BLOCKED_BY_KEY"
  | "NEEDS_PROVIDER_INSTALL";

export interface OCRProviderStatusRow {
  provider: OCRProviderType;
  status: OCRProviderStatusValue;
  display_name: string;
  /** Calm, user-facing one-liner. Never developer vocabulary. */
  description: string;
  required_envs: string[];
}

export interface OCRExtractInput {
  /** Caller-provided text for the PLAIN_TEXT path. */
  plain_text?: string;
}

export type OCRExtractResult =
  | { ok: true; text: string; provider: OCRProviderType }
  | {
      ok: false;
      code:
        | "PROVIDER_BLOCKED_BY_KEY"
        | "PROVIDER_NEEDS_INSTALL"
        | "PLAIN_TEXT_REQUIRED";
      message: string;
    };

// The Phase 1213 canonical demo fixture text. Routing the DEMO
// fixture through the SAME canonical capture means the downstream
// comms-extract pipeline auto-detects DEMO_SCRIPTED and produces the
// full roster-aware demo extraction (decisions + commitments +
// suggested follow-ups) with zero credentials.
export const DEMO_OBSERVE_FIXTURE_TEXT = [
  "Launch Follow-Up Meeting — whiteboard photo notes.",
  "Decision: we are locking the launch date for the 24th.",
  "David will own the UI review and send the revised flow on Thursday.",
  "Samiksha agreed to draft the launch comms plan by Friday.",
  "Annie will compile the beta feedback summary before the next sync.",
].join("\n");

function hasEnv(keys: string[]): boolean {
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.length > 0;
  });
}

const AWS_ENVS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"];
const GOOGLE_ENVS = ["GOOGLE_CLOUD_VISION_API_KEY"];

// WHAT: Status for every OCR provider in the closed vocab.
// INPUT: None (reads provider envs).
// OUTPUT: One row per provider, honest about what works today.
// WHY: The Observe page and onboarding readiness both need a single
//      truthful source for "what can Otzar read right now."
export function listOCRProviderStatuses(): OCRProviderStatusRow[] {
  return [
    {
      provider: "DEMO_FIXTURE",
      status: "DEMO_ONLY",
      display_name: "Sample document",
      description:
        "Try Otzar's reading flow with a built-in sample. Always available.",
      required_envs: [],
    },
    {
      provider: "PLAIN_TEXT",
      status: "READY",
      display_name: "Pasted text",
      description:
        "Paste text from any document and let Otzar organize it. Always available.",
      required_envs: [],
    },
    {
      provider: "TESSERACT_LOCAL",
      status: "NEEDS_PROVIDER_INSTALL",
      display_name: "Local image reading",
      description:
        "Reads images on this computer without sending them anywhere. Not installed yet.",
      required_envs: [],
    },
    {
      provider: "AWS_TEXTRACT",
      status: hasEnv(AWS_ENVS) ? "READY" : "BLOCKED_BY_KEY",
      display_name: "AWS Textract",
      description: hasEnv(AWS_ENVS)
        ? "Cloud document reading is configured."
        : "Cloud document reading. Needs your organization's AWS setup.",
      required_envs: AWS_ENVS,
    },
    {
      provider: "GOOGLE_VISION",
      status: hasEnv(GOOGLE_ENVS) ? "READY" : "BLOCKED_BY_KEY",
      display_name: "Google Cloud Vision",
      description: hasEnv(GOOGLE_ENVS)
        ? "Cloud image reading is configured."
        : "Cloud image reading. Needs your organization's Google Cloud setup.",
      required_envs: GOOGLE_ENVS,
    },
  ];
}

// WHAT: Run the named provider's text-extraction path.
// INPUT: provider + OCRExtractInput.
// OUTPUT: Extracted text, or an honest closed-vocab failure.
// WHY: One dispatch point so observe-intake never branches on
//      provider internals. Real OCR engines slot in here later.
export function extractTextWithProvider(
  provider: OCRProviderType,
  input: OCRExtractInput,
): OCRExtractResult {
  switch (provider) {
    case "DEMO_FIXTURE":
      return { ok: true, text: DEMO_OBSERVE_FIXTURE_TEXT, provider };
    case "PLAIN_TEXT": {
      const text = input.plain_text?.trim() ?? "";
      if (text.length === 0) {
        return {
          ok: false,
          code: "PLAIN_TEXT_REQUIRED",
          message: "Paste the text you want Otzar to read.",
        };
      }
      return { ok: true, text, provider };
    }
    case "TESSERACT_LOCAL":
      return {
        ok: false,
        code: "PROVIDER_NEEDS_INSTALL",
        message:
          "Local image reading is not installed yet. Use pasted text or the sample for now.",
      };
    case "AWS_TEXTRACT":
      if (!hasEnv(AWS_ENVS)) {
        return {
          ok: false,
          code: "PROVIDER_BLOCKED_BY_KEY",
          message:
            "Cloud document reading needs your organization's AWS setup first.",
        };
      }
      // Credentials present but the Textract client is a follow-on
      // slice — stay honest rather than pretending to OCR.
      return {
        ok: false,
        code: "PROVIDER_NEEDS_INSTALL",
        message:
          "AWS document reading is configured but not activated yet in this build.",
      };
    case "GOOGLE_VISION":
      if (!hasEnv(GOOGLE_ENVS)) {
        return {
          ok: false,
          code: "PROVIDER_BLOCKED_BY_KEY",
          message:
            "Cloud image reading needs your organization's Google Cloud setup first.",
        };
      }
      return {
        ok: false,
        code: "PROVIDER_NEEDS_INSTALL",
        message:
          "Google image reading is configured but not activated yet in this build.",
      };
  }
}
