// FILE: scripts/generate-canonical-fixtures.ts
// PURPOSE: Generate byte-equivalence fixture pairs for the Elixir
//          register's CosmpRouter.Audit.canonical_record/1 + sha256_hex
//          implementations to verify against per ADR-0033 §Decision 4
//          (cross-language audit-chain byte-equivalence).
// CONNECTS TO:
//   packages/database/src/queries/audit.ts (canonicalRecord +
//     canonicalJson source-of-truth)
//   packages/auth/src/crypto.ts (sha256Hex)
//   apps/cosmp_router/test/fixtures/canonical_record/fixtures.json
//     (output destination; committed to repo)
//   apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs
//     (Elixir consumer; asserts byte-for-byte hash equivalence)
// USAGE: PATH=/usr/local/bin:$PATH npx tsx scripts/generate-canonical-fixtures.ts
//
// Re-run this script when:
// - canonicalRecord field set changes (audit.ts canonicalRecord signature)
// - canonicalJson serialization discipline changes (rare; would break
//   chain integrity for existing rows)
// - sha256Hex algorithm changes (rare; CRYPTO_CONFIG.HASH_ALGORITHM)
// - New fixture cases are added below to cover edge cases

import { canonicalRecord, canonicalJson } from "@niov/database";
import { sha256Hex } from "@niov/auth";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

interface FixtureInput {
  audit_id: string;
  event_type: string;
  actor_entity_id: string | null;
  target_entity_id: string | null;
  target_capsule_id: string | null;
  session_id: string | null;
  outcome: string;
  denial_reason: string | null;
  details: unknown;
  ip_address: string | null;
  timestamp: Date;
  previous_event_hash: string | null;
  // CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] per
  // ADR-0036 Sub-decision 5: canonical_record/1 positions 13 + 14.
  lawful_basis_id: string | null;
  lawful_basis_chain_hash: string | null;
}

interface FixtureCase {
  description: string;
  input: FixtureInput;
}

// 8-12 representative AuditEvent shapes per D-5BII-EXEC-4 spec:
// nullable fields, edge cases, timestamp precision boundary, unicode.
//
// CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] per
// ADR-0036 Sub-decision 5: every fixture carries lawful_basis_id +
// lawful_basis_chain_hash (positions 13 + 14 of canonical_record/1).
// Fixtures #1-10 keep both at null (absent-default coverage proves
// the empty-string canonicalization for non-lawful-basis emissions).
// Fixtures #11-12 populate both (proves the cryptographic-binding
// extension for REGULATOR-actor emissions per ADR-0036 §Patent-
// Implementation Evidence).
const fixtureCases: FixtureCase[] = [
  {
    description: "minimal: all-null optionals + empty details",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000001",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: {},
      ip_address: null,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "fully-populated: every field non-null + flat details",
    input: {
      audit_id: "11111111-1111-1111-1111-111111111111",
      event_type: "ENTITY_REGISTERED",
      actor_entity_id: "22222222-2222-2222-2222-222222222222",
      target_entity_id: "33333333-3333-3333-3333-333333333333",
      target_capsule_id: "44444444-4444-4444-4444-444444444444",
      session_id: "55555555-5555-5555-5555-555555555555",
      outcome: "SUCCESS",
      denial_reason: "n/a",
      details: { reason: "test", count: 42 },
      ip_address: "10.0.0.1",
      timestamp: new Date("2026-05-13T22:28:40.000Z"),
      previous_event_hash:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "details with sorted-key invariant: keys in order Z,A,M",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000002",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: { z: 1, a: 2, m: 3 },
      ip_address: null,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "details nested object: sorted recursively",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000003",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: {
        outer: { z: "last", a: "first" },
        scalar: 99,
      },
      ip_address: null,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "details with array of objects (no sorting; preserve order)",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000004",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: { items: [{ b: 2 }, { a: 1 }] },
      ip_address: null,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "unicode: details contains UTF-8 strings + emoji",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000005",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: { name: "café", flag: "🇺🇸", chinese: "你好" },
      ip_address: null,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "escape sequences: details contains quotes + backslashes + newlines",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000006",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: { quoted: 'He said "hi"', path: "C:\\foo\\bar", line: "a\nb" },
      ip_address: null,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "timestamp precision boundary: exact-second (no millis)",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000007",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: {},
      ip_address: null,
      timestamp: new Date("2026-05-13T22:28:40.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "timestamp precision boundary: with millis (567)",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000008",
      event_type: "TEST_EVENT",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: {},
      ip_address: null,
      timestamp: new Date("2026-05-13T22:28:40.567Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    description: "denial_reason non-null + outcome FAILURE",
    input: {
      audit_id: "00000000-0000-0000-0000-000000000009",
      event_type: "LOGIN_FAILED",
      actor_entity_id: "22222222-2222-2222-2222-222222222222",
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "FAILURE",
      denial_reason: "invalid_password",
      details: { attempt_count: 3 },
      ip_address: "192.168.1.1",
      timestamp: new Date("2026-05-13T22:28:40.000Z"),
      previous_event_hash: null,
      lawful_basis_id: null,
      lawful_basis_chain_hash: null,
    },
  },
  {
    // Sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] NEW per ADR-0036
    // Sub-decision 5: lawful-basis populated minimal case.
    description:
      "lawful-basis populated — minimal REGULATOR_ACCESS_GRANTED with chain hash binding",
    input: {
      audit_id: "00000000-0000-0000-0000-00000000000a",
      event_type: "REGULATOR_ACCESS_GRANTED",
      actor_entity_id: null,
      target_entity_id: null,
      target_capsule_id: null,
      session_id: null,
      outcome: "SUCCESS",
      denial_reason: null,
      details: {},
      ip_address: null,
      timestamp: new Date("2026-05-15T10:00:00.000Z"),
      previous_event_hash: null,
      lawful_basis_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      lawful_basis_chain_hash:
        "1111111111111111111111111111111111111111111111111111111111111111",
    },
  },
  {
    // Sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] NEW per ADR-0036
    // Sub-decision 5: lawful-basis populated fully-populated case
    // (every AuditEvent field set + lawful-basis present).
    description:
      "lawful-basis populated — fully-populated REGULATOR_ACCESS_GRANTED + flat details + previous chain link",
    input: {
      audit_id: "00000000-0000-0000-0000-00000000000b",
      event_type: "REGULATOR_ACCESS_GRANTED",
      actor_entity_id: "66666666-6666-6666-6666-666666666666",
      target_entity_id: "77777777-7777-7777-7777-777777777777",
      target_capsule_id: "88888888-8888-8888-8888-888888888888",
      session_id: "99999999-9999-9999-9999-999999999999",
      outcome: "SUCCESS",
      denial_reason: null,
      details: { jurisdiction: "US-FEDERAL", scope: "SECURITIES_EXAMINATION" },
      ip_address: "10.0.0.42",
      timestamp: new Date("2026-05-15T11:30:45.123Z"),
      previous_event_hash:
        "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
      lawful_basis_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      lawful_basis_chain_hash:
        "2222222222222222222222222222222222222222222222222222222222222222",
    },
  },
];

interface FixtureOutput {
  description: string;
  input: Omit<FixtureInput, "timestamp"> & { timestamp: string };
  canonical_input: string;
  expected_hash: string;
}

const computed: FixtureOutput[] = fixtureCases.map((fc) => {
  const canonical = canonicalRecord(fc.input);
  const hash = sha256Hex(canonical);
  return {
    description: fc.description,
    // Serialize input.timestamp as ISO string for JSON portability.
    // Elixir test parses this back with DateTime.from_iso8601.
    input: {
      ...fc.input,
      timestamp: fc.input.timestamp.toISOString(),
    },
    canonical_input: canonical,
    expected_hash: hash,
  };
});

const outputDir = resolve(
  __dirname,
  "../apps/cosmp_router/test/fixtures/canonical_record",
);
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "fixtures.json");
writeFileSync(outputPath, JSON.stringify(computed, null, 2) + "\n", "utf8");

console.log(`Generated ${computed.length} canonical fixtures.`);
console.log(`Output: ${outputPath}`);
console.log("");
console.log("Sanity sample (first fixture):");
console.log(`  description: ${computed[0]!.description}`);
console.log(`  canonical_input length: ${computed[0]!.canonical_input.length}`);
console.log(`  expected_hash: ${computed[0]!.expected_hash}`);

// Sanity: also verify canonicalJson directly with a known input
const knownJson = canonicalJson({ b: 2, a: 1 });
const expectedKnown = '{"a":1,"b":2}';
if (knownJson !== expectedKnown) {
  console.error(
    `FATAL: canonicalJson sanity failed. Got: ${knownJson} expected: ${expectedKnown}`,
  );
  process.exit(1);
}
console.log("");
console.log(`canonicalJson sanity pass: {b:2,a:1} → ${knownJson}`);
