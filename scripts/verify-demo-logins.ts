// FILE: scripts/verify-demo-logins.ts
// PURPOSE: Phase 1304-C login proof — independently verify that every
//          allowlisted demo account can authenticate against the running
//          API with the shared demo password (supplied via DEMO_SHARED_PASSWORD
//          env only), that a wrong password is still rejected (401), and that
//          the Founder's token is accepted by the protected / org-admin
//          endpoints that back the Control Tower surfaces.
//
//          Runs read-only against the API (POST /auth/login + authenticated
//          GETs). Makes NO database writes. Designed to run in the SAME process
//          as the provisioning step so the shared password lives only in the
//          process environment (never on disk, never echoed).
//
// SECRECY: never prints the password, any JWT, or any hash. Tokens are reported
//          as present:yes/no only; entity_id is read from the JWT payload
//          (public claim, no secret) purely for the proof table.
//
// USAGE (typically chained after provisioning in one invocation):
//   DEMO_SHARED_PASSWORD='********' \
//     node --import tsx scripts/verify-demo-logins.ts
//   # optional: API_BASE (default http://localhost:3000)
//
// CONNECTS TO: apps/api POST /api/v1/auth/login (+ the CT-surface GET routes),
//              scripts/provision-demo-team-accounts.ts (same allowlist).

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";
const PASSWORD_ENV = "DEMO_SHARED_PASSWORD";

const ALLOWLIST: ReadonlyArray<{ email: string; founder: boolean }> = [
  { email: "sadeil@niovlabs.com", founder: true },
  { email: "david@niovlabs.com", founder: false },
  { email: "vishesh@niovlabs.com", founder: false },
  { email: "samiksha@niovlabs.com", founder: false },
  { email: "shweta@niovlabs.com", founder: false },
  { email: "william@niovlabs.com", founder: false },
  { email: "annie@niovlabs.com", founder: false },
  { email: "walter@niovlabs.com", founder: false },
];

// CT-surface backing endpoints (read-only GET, exercised with the Founder
// token). A non-401/403 status means the surface's backing route accepts the
// authenticated Founder.
const SURFACE_PROBES: ReadonlyArray<{ label: string; path: string }> = [
  { label: "Notifications", path: "/api/v1/notifications" },
  { label: "Review Center", path: "/api/v1/foundation/high-sensitivity/reviews" },
  { label: "Marketplace shell", path: "/api/v1/foundation/marketplace/listings" },
  { label: "Action Center", path: "/api/v1/actions" },
  { label: "Ask your Twin", path: "/api/v1/otzar/my-twin" },
  { label: "Operational Health", path: "/api/v1/org/analytics" },
  { label: "Comms", path: "/api/v1/otzar/conversations" },
];

interface LoginProof {
  email: string;
  founder: boolean;
  status: number;
  ok: boolean;
  token_present: boolean;
  allowed_operations: string[] | null;
  clearance_ceiling: number | null;
  entity_id: string | null;
}

// WHAT: Read entity_id from a JWT payload without verifying the signature.
// INPUT: a compact JWS string.
// OUTPUT: entity_id / sub claim, or null. WHY: the proof table wants a safe
//         entity_id; the payload is a public claim (no secret) — we never log
//         the token itself.
function entityIdFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1] as string, "base64url").toString("utf8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    const id = claims["entity_id"] ?? claims["sub"];
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

async function login(
  email: string,
  password: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function main(): Promise<void> {
  const password = process.env[PASSWORD_ENV] ?? "";
  if (password.length === 0) {
    console.error(`\n[verify] REFUSING: ${PASSWORD_ENV} is required (supply via env; never printed).\n`);
    process.exit(1);
  }

  console.log(`\n=== PHASE 1304-C LOGIN PROOF ===`);
  console.log(`API base: ${API_BASE}`);
  console.log(`(password supplied via ${PASSWORD_ENV}; never printed; tokens shown as present:yes/no only)\n`);

  // 1) Every allowlisted account logs in with the shared password.
  const proofs: LoginProof[] = [];
  let founderToken: string | null = null;
  for (const a of ALLOWLIST) {
    const { status, body } = await login(a.email, password);
    const token = typeof body["token"] === "string" ? (body["token"] as string) : null;
    if (a.founder && token !== null) founderToken = token;
    proofs.push({
      email: a.email,
      founder: a.founder,
      status,
      ok: body["ok"] === true,
      token_present: token !== null,
      allowed_operations: Array.isArray(body["allowed_operations"])
        ? (body["allowed_operations"] as string[])
        : null,
      clearance_ceiling:
        typeof body["clearance_ceiling"] === "number"
          ? (body["clearance_ceiling"] as number)
          : null,
      entity_id: token !== null ? entityIdFromJwt(token) : null,
    });
  }

  console.log(`Login proof (${proofs.length} accounts):`);
  for (const p of proofs) {
    console.log(
      `  ${p.email.padEnd(26)} HTTP ${p.status}  ok=${String(p.ok).padEnd(5)} token=${p.token_present ? "yes" : "no "}  ceil=${p.clearance_ceiling ?? "-"}  ops=[${(p.allowed_operations ?? []).join(",")}]  entity=${p.entity_id ?? "-"}`,
    );
  }
  const allPass = proofs.every((p) => p.status === 200 && p.ok && p.token_present);
  console.log(`  => ${allPass ? "ALL 8 LOGINS PASS (200 + token)" : "FAILURES PRESENT — see above"}\n`);

  // 2) Wrong password is still rejected (lockout/auth not weakened).
  const wrong = await login("sadeil@niovlabs.com", "this-is-deliberately-the-wrong-password");
  const wrongOk = wrong.status === 401;
  console.log(
    `Wrong-password proof: sadeil@niovlabs.com + bad password -> HTTP ${wrong.status} (${wrongOk ? "401 as expected" : "UNEXPECTED"})\n`,
  );

  // 3) Founder token against protected / CT-surface endpoints.
  if (founderToken === null) {
    console.log(`Protected-route proof: SKIPPED (no Founder token)\n`);
  } else {
    console.log(`Protected-route + CT-surface proof (Founder token):`);
    for (const probe of SURFACE_PROBES) {
      let status = 0;
      try {
        const res = await fetch(`${API_BASE}${probe.path}`, {
          headers: { Authorization: `Bearer ${founderToken}` },
        });
        status = res.status;
      } catch {
        status = -1;
      }
      const authed = status !== 401 && status !== 403 && status !== -1;
      console.log(
        `  ${probe.label.padEnd(20)} GET ${probe.path.padEnd(48)} HTTP ${status}  ${authed ? "accepted" : "BLOCKED/err"}`,
      );
    }
    console.log("");
  }

  console.log(`=== END LOGIN PROOF ===\n`);
  if (!allPass || !wrongOk) process.exit(2);
}

main().catch((err) => {
  console.error("[verify] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
