// FILE: activation-email.service.ts
// PURPOSE: [ACT-EMAIL] Email DELIVERY for the P0-ONBOARD activation rail —
//          delivery only, never a new identity model. Sending an
//          activation email mints a fresh one-time token through the SAME
//          mintSetupToken rail (which supersedes prior unused tokens),
//          composes a minimal safe message (activation link + expiry +
//          "ignore if unexpected" note — no passwords, no org data, no
//          ids), and hands it to a PROVIDER ABSTRACTION:
//          - Real path: Resend, gated by THREE env vars —
//            ACTIVATION_EMAIL_USE_REAL="1" (master switch, matching the
//            *_USE_REAL repo pattern), RESEND_API_KEY, and
//            ACTIVATION_EMAIL_FROM. Links use CONTROL_TOWER_URL
//            (default https://app.otzar.ai).
//          - Honest path: when any of those is missing the provider is
//            NOT CONFIGURED and the service says so — no fake "email
//            sent" ever; the admin copy-link rail remains the fallback.
//          "Sent" means the provider ACCEPTED the message — delivery/
//          open tracking does not exist and is never claimed.
//          Security: the token appears ONLY inside the emailed link; it
//          is never logged, never audited, never returned from the
//          email endpoints. Audit (ACTIVATION_EMAIL_SENT/FAILED)
//          carries entity/org/token_id/provider category only.
// CONNECTS TO: auth-setup-token.service.ts (the one token rail),
//          routes/org.routes.ts (admin-gated send + batch + status),
//          CT Users page + CSV import result, P0-ONBOARD docs,
//          tests/integration/activation-email.test.ts.

import { prisma, writeAuditEvent } from "@niov/database";
import { mintSetupToken } from "./auth-setup-token.service.js";

export interface ActivationEmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type ProviderSendResult =
  | { ok: true; category: "accepted" }
  | { ok: false; category: "not_configured" | "provider_error"; detail?: string };

export interface ActivationEmailProvider {
  readonly name: string;
  send(message: ActivationEmailMessage): Promise<ProviderSendResult>;
}

/** True when all three env pieces exist — the honest "configured" gate. */
export function isActivationEmailConfigured(): boolean {
  return (
    process.env.ACTIVATION_EMAIL_USE_REAL === "1" &&
    typeof process.env.RESEND_API_KEY === "string" &&
    process.env.RESEND_API_KEY.length > 0 &&
    typeof process.env.ACTIVATION_EMAIL_FROM === "string" &&
    process.env.ACTIVATION_EMAIL_FROM.length > 0
  );
}

/** The env-gated Resend provider, or an honest not-configured stub. */
export function envActivationEmailProvider(): ActivationEmailProvider {
  if (!isActivationEmailConfigured()) {
    return {
      name: "not-configured",
      send: async () => ({ ok: false, category: "not_configured" }),
    };
  }
  const apiKey = process.env.RESEND_API_KEY as string;
  const from = process.env.ACTIVATION_EMAIL_FROM as string;
  return {
    name: "resend",
    send: async (message) => {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
        });
        if (res.ok) return { ok: true, category: "accepted" };
        return { ok: false, category: "provider_error", detail: `status ${res.status}` };
      } catch {
        return { ok: false, category: "provider_error", detail: "network" };
      }
    },
  };
}

function appBaseUrl(): string {
  const raw = process.env.CONTROL_TOWER_URL;
  const base = typeof raw === "string" && raw.length > 0 ? raw : "https://app.otzar.ai";
  return base.replace(/\/+$/, "");
}

/** Compose the minimal safe activation email. The token exists ONLY in
 *  the link; no passwords, no internal ids, no org data beyond the name. */
export function composeActivationEmail(args: {
  to: string;
  orgDisplayName: string | null;
  activationUrl: string;
  expiresAt: Date;
}): ActivationEmailMessage {
  const days = Math.max(1, Math.round((args.expiresAt.getTime() - Date.now()) / 86_400_000));
  const orgLine =
    args.orgDisplayName !== null
      ? `You've been invited to join ${args.orgDisplayName} on Otzar.`
      : "You've been invited to join your organization on Otzar.";
  return {
    to: args.to,
    subject: "Activate your Otzar account",
    text: [
      orgLine,
      "",
      "Activate your account with this one-time link:",
      args.activationUrl,
      "",
      `This link can be used once and expires in about ${days} day${days === 1 ? "" : "s"}.`,
      "You'll choose your own password during activation.",
      "",
      "If you did not expect this invite, you can ignore this email.",
    ].join("\n"),
  };
}

export type SendActivationEmailResult =
  | { ok: true; status: "sent"; expires_at: string }
  | {
      ok: false;
      code:
        | "EMAIL_NOT_CONFIGURED"
        | "ENTITY_NOT_IN_ORG"
        | "ALREADY_ACTIVE"
        | "NO_EMAIL_ON_RECORD"
        | "PROVIDER_FAILED";
      message: string;
    };

/** Send ONE activation email to a pending org member. Admin authority is
 *  enforced by the route; this service enforces org boundary, the
 *  already-active guard, and honest provider results. */
export async function sendActivationEmailForMember(args: {
  caller_entity_id: string;
  org_entity_id: string;
  target_entity_id: string;
  provider: ActivationEmailProvider;
}): Promise<SendActivationEmailResult> {
  const membership = await prisma.entityMembership.findFirst({
    where: { parent_id: args.org_entity_id, child_id: args.target_entity_id, is_active: true },
    select: { membership_id: true },
  });
  const target =
    membership !== null
      ? await prisma.entity.findUnique({
          where: { entity_id: args.target_entity_id },
          select: { status: true, password_hash: true, email: true },
        })
      : null;
  if (target === null || target.status === "DELETED") {
    return { ok: false, code: "ENTITY_NOT_IN_ORG", message: "Entity is not in your org" };
  }
  if (typeof target.password_hash === "string" && target.password_hash.length > 0) {
    return {
      ok: false,
      code: "ALREADY_ACTIVE",
      message: "This member already set a password — no activation email is needed.",
    };
  }
  if (typeof target.email !== "string" || target.email.length === 0) {
    return {
      ok: false,
      code: "NO_EMAIL_ON_RECORD",
      message: "This member has no email address on record.",
    };
  }
  // Provider gate BEFORE minting — never burn a token for a send that
  // cannot happen.
  if (provider_is_not_configured(args.provider)) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email delivery isn't configured yet — copy the activation link instead.",
    };
  }

  const org = await prisma.entity.findUnique({
    where: { entity_id: args.org_entity_id },
    select: { display_name: true },
  });
  const minted = await mintSetupToken({
    entity_id: args.target_entity_id,
    org_entity_id: args.org_entity_id,
    purpose: "ACTIVATION",
    created_by: args.caller_entity_id,
  });
  const message = composeActivationEmail({
    to: target.email,
    orgDisplayName: org?.display_name ?? null,
    activationUrl: `${appBaseUrl()}/activate?token=${minted.token}`,
    expiresAt: minted.expires_at,
  });
  const sent = await args.provider.send(message);
  await writeAuditEvent({
    event_type: sent.ok ? "ACTIVATION_EMAIL_SENT" : "ACTIVATION_EMAIL_FAILED",
    outcome: sent.ok ? "SUCCESS" : "ERROR",
    actor_entity_id: args.caller_entity_id,
    target_entity_id: args.target_entity_id,
    details: {
      org_entity_id: args.org_entity_id,
      token_id: minted.token_id,
      provider: args.provider.name,
      provider_category: sent.ok ? "accepted" : sent.category,
      // NEVER the token, NEVER the activation URL, NEVER the body.
    },
  });
  if (!sent.ok) {
    return {
      ok: false,
      code: "PROVIDER_FAILED",
      message:
        "The email provider didn't accept the message. Nothing was delivered — copy the activation link instead.",
    };
  }
  return { ok: true, status: "sent", expires_at: minted.expires_at.toISOString() };
}

function provider_is_not_configured(p: ActivationEmailProvider): boolean {
  return p.name === "not-configured";
}

export const ACTIVATION_EMAIL_BATCH_MAX = 20;

// ── [PASSWORD-LIFECYCLE] password-reset email — the reset sibling ──────────
// Same provider abstraction, same token rail (purpose PASSWORD_RESET, 1h
// TTL, one-time, supersedes priors), DISTINCT template. Guard is the
// mirror of activation: only members who HAVE a password get a reset
// email (pending members get the activation path — the two purposes
// never blur). The token exists only inside the emailed link.

/** Compose the minimal safe password-reset email. */
export function composePasswordResetEmail(args: {
  to: string;
  orgDisplayName: string | null;
  resetUrl: string;
}): ActivationEmailMessage {
  const orgLine =
    args.orgDisplayName !== null
      ? `A password reset was requested for your Otzar account at ${args.orgDisplayName}.`
      : "A password reset was requested for your Otzar account.";
  return {
    to: args.to,
    subject: "Reset your Otzar password",
    text: [
      orgLine,
      "",
      "Choose a new password with this one-time link:",
      args.resetUrl,
      "",
      "This link can be used once and expires in about 1 hour.",
      "Admins never see or set your password.",
      "",
      "If you did not request this, you can ignore this email — your password stays unchanged.",
    ].join("\n"),
  };
}

export type SendPasswordResetEmailResult =
  | { ok: true; status: "sent"; expires_at: string }
  | {
      ok: false;
      code:
        | "EMAIL_NOT_CONFIGURED"
        | "ENTITY_NOT_IN_ORG"
        | "NO_PASSWORD_YET"
        | "NO_EMAIL_ON_RECORD"
        | "PROVIDER_FAILED";
      message: string;
    };

/** Send ONE password-reset email to an ACTIVE (password-holding) member. */
export async function sendPasswordResetEmailForMember(args: {
  caller_entity_id: string;
  org_entity_id: string;
  target_entity_id: string;
  provider: ActivationEmailProvider;
}): Promise<SendPasswordResetEmailResult> {
  const membership = await prisma.entityMembership.findFirst({
    where: { parent_id: args.org_entity_id, child_id: args.target_entity_id, is_active: true },
    select: { membership_id: true },
  });
  const target =
    membership !== null
      ? await prisma.entity.findUnique({
          where: { entity_id: args.target_entity_id },
          select: { status: true, password_hash: true, email: true },
        })
      : null;
  if (target === null || target.status === "DELETED") {
    return { ok: false, code: "ENTITY_NOT_IN_ORG", message: "Entity is not in your org" };
  }
  if (typeof target.password_hash !== "string" || target.password_hash.length === 0) {
    return {
      ok: false,
      code: "NO_PASSWORD_YET",
      message: "This member hasn't activated yet — send an activation email instead.",
    };
  }
  if (typeof target.email !== "string" || target.email.length === 0) {
    return { ok: false, code: "NO_EMAIL_ON_RECORD", message: "This member has no email address on record." };
  }
  if (provider_is_not_configured(args.provider)) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email delivery isn't configured yet — copy the reset link instead.",
    };
  }
  const org = await prisma.entity.findUnique({
    where: { entity_id: args.org_entity_id },
    select: { display_name: true },
  });
  const minted = await mintSetupToken({
    entity_id: args.target_entity_id,
    org_entity_id: args.org_entity_id,
    purpose: "PASSWORD_RESET",
    created_by: args.caller_entity_id,
  });
  const message = composePasswordResetEmail({
    to: target.email,
    orgDisplayName: org?.display_name ?? null,
    resetUrl: `${appBaseUrl()}/activate?token=${minted.token}`,
  });
  const sent = await args.provider.send(message);
  await writeAuditEvent({
    event_type: sent.ok ? "PASSWORD_RESET_EMAIL_SENT" : "PASSWORD_RESET_EMAIL_FAILED",
    outcome: sent.ok ? "SUCCESS" : "ERROR",
    actor_entity_id: args.caller_entity_id,
    target_entity_id: args.target_entity_id,
    details: {
      org_entity_id: args.org_entity_id,
      token_id: minted.token_id,
      provider: args.provider.name,
      provider_category: sent.ok ? "accepted" : sent.category,
      // NEVER the token, the URL, or the body.
    },
  });
  if (!sent.ok) {
    return {
      ok: false,
      code: "PROVIDER_FAILED",
      message: "The email provider didn't accept the message. Nothing was delivered — copy the reset link instead.",
    };
  }
  return { ok: true, status: "sent", expires_at: minted.expires_at.toISOString() };
}
