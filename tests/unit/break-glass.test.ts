// FILE: break-glass.test.ts (unit)
// PURPOSE: GOVSEC.5 break-glass / time-boxed audit (GAP-K1, ADR-0050) BG.1
//          substrate tests. Exercises the break-glass governance service at the
//          substrate level only -- create / validate / markUsed / expire /
//          review + audit completeness -- WITHOUT any middleware/route live
//          bypass (that is BG.2). Real containerized Postgres (the
//          escalation.test.ts pattern); no vi.mock; no real Redis; no timing.
// CONNECTS TO: @niov/api (break-glass.service.ts), @niov/database (prisma +
//              auditEvent), tests/helpers.ts (createEntity / makeEntityInput /
//              cleanupTestData / ensureAuditTriggers / TEST_PREFIX).

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  createBreakGlassGrant,
  validateBreakGlassGrant,
  markBreakGlassUsed,
  expireBreakGlassGrant,
  reviewBreakGlassGrant,
} from "@niov/api";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

// One of the 4 dual-control PRIVILEGED_ENDPOINTS action-descriptor types
// break-glass is scoped to.
const ACTION = "PLATFORM_MONETIZATION_CONFIG_UPDATE";
const OTHER_ACTION = "PLATFORM_ORG_CREATION";

function future(ms = 60 * 60 * 1000): Date {
  return new Date(Date.now() + ms);
}

// Delete every break_glass_grants row referencing a test entity
// (source / reviewer). Runs BEFORE cleanupTestData() so the entity FKs are not
// orphaned. Query-based so it also clears stale rows from a prior run.
async function cleanupTestBreakGlass(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.breakGlassGrant.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { reviewed_by_entity_id: { in: ids } },
      ],
    },
  });
}

async function makeParty(): Promise<string> {
  const e = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  return e.entity_id;
}

// Find the most recent audit row of `eventType` whose details.grant_id matches.
async function findBreakGlassAudit(
  eventType: string,
  grantId: string,
): Promise<{ event_type: string; actor_entity_id: string | null } | undefined> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: eventType },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
  const match = rows.find(
    (r) => (r.details as Record<string, unknown>).grant_id === grantId,
  );
  return match === undefined
    ? undefined
    : { event_type: match.event_type, actor_entity_id: match.actor_entity_id };
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestBreakGlass();
  await cleanupTestData();
});

afterEach(async () => {
  await cleanupTestBreakGlass();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestBreakGlass();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("GOVSEC.5 break-glass BG.1 substrate (GAP-K1, ADR-0050)", () => {
  describe("createBreakGlassGrant", () => {
    it("creates an ACTIVE grant with mandatory valid_until + justification", async () => {
      const source = await makeParty();
      const validUntil = future();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "primary approver unreachable; urgent config fix",
        valid_until: validUntil,
      });
      expect(grant.source_entity_id).toBe(source);
      expect(grant.action_type).toBe(ACTION);
      expect(grant.status).toBe("ACTIVE");
      expect(grant.valid_until.getTime()).toBe(validUntil.getTime());
    });

    it("rejects missing/empty justification", async () => {
      const source = await makeParty();
      await expect(
        createBreakGlassGrant(source, {
          action_type: ACTION,
          justification: "   ",
          valid_until: future(),
        }),
      ).rejects.toThrow(/BREAK_GLASS_JUSTIFICATION_REQUIRED/);
    });

    it("rejects missing valid_until", async () => {
      const source = await makeParty();
      await expect(
        createBreakGlassGrant(source, {
          action_type: ACTION,
          justification: "x",
          valid_until: undefined as unknown as Date,
        }),
      ).rejects.toThrow(/BREAK_GLASS_VALID_UNTIL_REQUIRED/);
    });

    it("rejects a past valid_until (no perpetual / no already-expired grant)", async () => {
      const source = await makeParty();
      await expect(
        createBreakGlassGrant(source, {
          action_type: ACTION,
          justification: "x",
          valid_until: new Date(Date.now() - 60_000),
        }),
      ).rejects.toThrow(/BREAK_GLASS_VALID_UNTIL_IN_PAST/);
    });

    it("rejects an action outside the 4 privileged-endpoint scope", async () => {
      const source = await makeParty();
      await expect(
        createBreakGlassGrant(source, {
          action_type: "NOT_A_PRIVILEGED_ACTION",
          justification: "x",
          valid_until: future(),
        }),
      ).rejects.toThrow(/BREAK_GLASS_ACTION_NOT_PRIVILEGED/);
    });

    it("emits BREAK_GLASS_INVOKED on create", async () => {
      const source = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      const audit = await findBreakGlassAudit("BREAK_GLASS_INVOKED", grant.grant_id);
      expect(audit).toBeDefined();
      expect(audit!.actor_entity_id).toBe(source);
    });
  });

  describe("validateBreakGlassGrant", () => {
    it("returns an ACTIVE unexpired grant for the matching source + action", async () => {
      const source = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      const found = await validateBreakGlassGrant(source, ACTION);
      expect(found?.grant_id).toBe(grant.grant_id);
    });

    it("returns null once the grant's valid_until has passed", async () => {
      const source = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      // force the window closed (cannot create with a past valid_until)
      await prisma.breakGlassGrant.update({
        where: { grant_id: grant.grant_id },
        data: { valid_until: new Date(Date.now() - 1000) },
      });
      expect(await validateBreakGlassGrant(source, ACTION)).toBeNull();
    });

    it("returns null for a mismatched action", async () => {
      const source = await makeParty();
      await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      expect(await validateBreakGlassGrant(source, OTHER_ACTION)).toBeNull();
    });

    it("returns null for a mismatched source entity", async () => {
      const source = await makeParty();
      const other = await makeParty();
      await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      expect(await validateBreakGlassGrant(other, ACTION)).toBeNull();
    });
  });

  describe("markBreakGlassUsed", () => {
    it("consumes an ACTIVE grant (-> USED) and emits BREAK_GLASS_USED", async () => {
      const source = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      const used = await markBreakGlassUsed(grant.grant_id);
      expect(used.status).toBe("USED");
      expect(used.used_at).not.toBeNull();
      // single-use: a USED grant no longer validates as ACTIVE
      expect(await validateBreakGlassGrant(source, ACTION)).toBeNull();
      expect(await findBreakGlassAudit("BREAK_GLASS_USED", grant.grant_id)).toBeDefined();
    });
  });

  describe("expireBreakGlassGrant", () => {
    it("expires an ACTIVE grant (-> EXPIRED) and emits BREAK_GLASS_EXPIRED", async () => {
      const source = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      const expired = await expireBreakGlassGrant(grant.grant_id);
      expect(expired.status).toBe("EXPIRED");
      expect(expired.expired_at).not.toBeNull();
      expect(await findBreakGlassAudit("BREAK_GLASS_EXPIRED", grant.grant_id)).toBeDefined();
    });
  });

  describe("reviewBreakGlassGrant (mandatory two-person review)", () => {
    it("forbids self-review: reviewer === source -> BREAK_GLASS_SELF_REVIEW_FORBIDDEN", async () => {
      const source = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      await expect(
        reviewBreakGlassGrant(grant.grant_id, source),
      ).rejects.toThrow(/BREAK_GLASS_SELF_REVIEW_FORBIDDEN/);
    });

    it("accepts a DISTINCT reviewer (-> REVIEWED) and emits BREAK_GLASS_REVIEWED", async () => {
      const source = await makeParty();
      const reviewer = await makeParty();
      const grant = await createBreakGlassGrant(source, {
        action_type: ACTION,
        justification: "x",
        valid_until: future(),
      });
      const reviewed = await reviewBreakGlassGrant(grant.grant_id, reviewer);
      expect(reviewed.status).toBe("REVIEWED");
      expect(reviewed.reviewed_by_entity_id).toBe(reviewer);
      expect(reviewed.reviewed_at).not.toBeNull();
      const audit = await findBreakGlassAudit("BREAK_GLASS_REVIEWED", grant.grant_id);
      expect(audit).toBeDefined();
      expect(audit!.actor_entity_id).toBe(reviewer);
    });
  });
});
