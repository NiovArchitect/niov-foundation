// FILE: auth-setup-token.service.ts
// PURPOSE: [P0-ONBOARD] One-time activation / password-reset tokens — the
//          severed onboarding loop's missing link. Security model:
//            - plaintext token exists ONLY in the mint return value (shown
//              once to the authenticated org admin — the sanctioned
//              controlled-pilot delivery channel until email exists) and in
//              the URL the invitee opens; sha256 at rest; never logged;
//              never in list projections; never re-displayable.
//            - expiring (7d activation / 1h reset), one-time (used_at),
//              org-scoped (entity must be an active member of the minting
//              admin's org; redeem re-verifies the binding).
//            - minting invalidates prior open tokens for the same
//              entity+purpose (exactly one live link at a time).
//            - redeeming sets the entity's OWN password (bcrypt via
//              @niov/auth) — activation grants nothing else: TAR/membership/
//              twin/clearance come from the existing invite gates.
//            - PASSWORD_RESET redemption invalidates the entity's ACTIVE
//              sessions (the session rail supports INVALIDATED).
// CONNECTS TO: routes/auth.routes.ts (POST /auth/activate),
//          routes/org.routes.ts (admin mint endpoints + activation_status),
//          services/governance/dandelion.service.ts (Phase 3 invite mint),
//          tests/integration/onboarding-activation.test.ts.

import { createHash, randomBytes } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import { hashPassword } from "@niov/auth";

export const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const MIN_PASSWORD_LENGTH = 10;

export type SetupTokenPurpose = "ACTIVATION" | "PASSWORD_RESET";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Mint a one-time setup token. Returns the PLAINTEXT exactly once — the
 *  caller (an admin-gated route) is responsible for the single reveal.
 *  Prior open tokens for the same entity+purpose are invalidated so only
 *  one live link exists at a time. */
export async function mintSetupToken(args: {
  entity_id: string;
  org_entity_id: string;
  purpose: SetupTokenPurpose;
  created_by: string;
}): Promise<{ token: string; token_id: string; expires_at: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (args.purpose === "ACTIVATION" ? ACTIVATION_TTL_MS : RESET_TTL_MS),
  );
  const row = await prisma.$transaction(async (tx) => {
    await tx.authSetupToken.updateMany({
      where: {
        entity_id: args.entity_id,
        purpose: args.purpose,
        used_at: null,
      },
      data: { used_at: new Date() },
    });
    return tx.authSetupToken.create({
      data: {
        entity_id: args.entity_id,
        org_entity_id: args.org_entity_id,
        purpose: args.purpose,
        token_hash: sha256Hex(token),
        expires_at: expiresAt,
        created_by: args.created_by,
      },
      select: { token_id: true },
    });
  });
  return { token, token_id: row.token_id, expires_at: expiresAt };
}

export type RedeemResult =
  | { ok: true; entity_id: string; purpose: SetupTokenPurpose }
  | { ok: false; code: "TOKEN_INVALID" | "TOKEN_EXPIRED" | "TOKEN_USED" | "WEAK_PASSWORD"; message: string };

/** Redeem a setup token: verify (hash lookup, unexpired, unused, entity
 *  still an active member of the token's org), set the entity's password,
 *  mark the token used, audit, and — for PASSWORD_RESET — invalidate the
 *  entity's ACTIVE sessions. One-time by construction. */
export async function redeemSetupToken(args: {
  token: string;
  password: string;
}): Promise<RedeemResult> {
  if (typeof args.password !== "string" || args.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      code: "WEAK_PASSWORD",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  const row =
    typeof args.token === "string" && args.token.length >= 16
      ? await prisma.authSetupToken.findUnique({ where: { token_hash: sha256Hex(args.token) } })
      : null;
  if (row === null) {
    return { ok: false, code: "TOKEN_INVALID", message: "This link is not valid." };
  }
  if (row.used_at !== null) {
    return { ok: false, code: "TOKEN_USED", message: "This link was already used." };
  }
  if (row.expires_at < new Date()) {
    return { ok: false, code: "TOKEN_EXPIRED", message: "This link has expired." };
  }
  // Org binding must still hold — a member removed from the org cannot
  // activate into it, and a token can never act cross-org.
  const membership = await prisma.entityMembership.findFirst({
    where: { parent_id: row.org_entity_id, child_id: row.entity_id, is_active: true },
    select: { membership_id: true },
  });
  const entity = await prisma.entity.findUnique({
    where: { entity_id: row.entity_id },
    select: { status: true },
  });
  if (membership === null || entity === null || entity.status === "DELETED") {
    return { ok: false, code: "TOKEN_INVALID", message: "This link is not valid." };
  }

  const passwordHash = await hashPassword(args.password);
  await prisma.$transaction(async (tx) => {
    // One-time: claim the token first; a concurrent redeem loses.
    const claimed = await tx.authSetupToken.updateMany({
      where: { token_id: row.token_id, used_at: null },
      data: { used_at: new Date() },
    });
    if (claimed.count !== 1) throw new Error("TOKEN_ALREADY_CLAIMED");
    await tx.entity.update({
      where: { entity_id: row.entity_id },
      data: { password_hash: passwordHash, failed_auth_attempts: 0 },
    });
    if (row.purpose === "PASSWORD_RESET") {
      await tx.session.updateMany({
        where: { entity_id: row.entity_id, status: "ACTIVE" },
        data: { status: "INVALIDATED", invalidated_at: new Date() },
      });
    }
  });
  await writeAuditEvent({
    event_type: row.purpose === "ACTIVATION" ? "USER_ACTIVATED" : "PASSWORD_RESET_COMPLETED",
    outcome: "SUCCESS",
    actor_entity_id: row.entity_id,
    target_entity_id: row.entity_id,
    details: {
      token_id: row.token_id,
      org_entity_id: row.org_entity_id,
      ...(row.purpose === "PASSWORD_RESET" ? { sessions_invalidated: true } : {}),
    },
  });
  return { ok: true, entity_id: row.entity_id, purpose: row.purpose };
}

export type ActivationStatus = "active" | "activation_pending" | "expired" | "invited";

/** Safe per-member activation status for admin list projections — derived
 *  server-side; never exposes password_hash or any token material. */
export async function activationStatusForEntities(
  entityIds: string[],
): Promise<Map<string, ActivationStatus>> {
  const out = new Map<string, ActivationStatus>();
  if (entityIds.length === 0) return out;
  const [entities, tokens] = await Promise.all([
    prisma.entity.findMany({
      where: { entity_id: { in: entityIds } },
      select: { entity_id: true, password_hash: true },
    }),
    prisma.authSetupToken.findMany({
      where: { entity_id: { in: entityIds }, purpose: "ACTIVATION" },
      orderBy: { created_at: "desc" },
      select: { entity_id: true, used_at: true, expires_at: true },
    }),
  ]);
  const newestToken = new Map<string, { used_at: Date | null; expires_at: Date }>();
  for (const t of tokens) {
    if (!newestToken.has(t.entity_id)) newestToken.set(t.entity_id, t);
  }
  const now = new Date();
  for (const e of entities) {
    if (typeof e.password_hash === "string" && e.password_hash.length > 0) {
      out.set(e.entity_id, "active");
      continue;
    }
    const t = newestToken.get(e.entity_id);
    if (t === undefined) out.set(e.entity_id, "invited");
    else if (t.used_at === null && t.expires_at >= now) out.set(e.entity_id, "activation_pending");
    else out.set(e.entity_id, "expired");
  }
  return out;
}
