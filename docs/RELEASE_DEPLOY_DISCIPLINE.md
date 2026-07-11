# Foundation Release & Deploy Discipline

Process correction after the `602cc31` incident (2026-07-11): a deploy instruction named the
continuity-only commit `8888700`, but `main` had advanced to Stage-2 commit `602cc31` which added
an `obligations` schema-manifest requirement. Render deployed `main`'s head; the boot guard
correctly failed closed (`STARTUP_SCHEMA_INCOMPATIBLE: table obligations missing`) before listen,
so the previous healthy revision kept serving — but the intended deploy did not land. This was a
**release-process failure** (ambiguous/stale deploy target), not user error and not a code defect.
The guard did exactly its job.

## Rules (binding)

1. **Every deploy instruction names all five:** repository · service · **exact full SHA** · schema
   prerequisite · whether the SHA is deployable before activation. No "latest", no bare `main`.

2. **A handed-off deploy SHA is immutable.** Once a specific SHA is given to the operator, do not
   later say "deploy latest". If `main` advances, explicitly state that the prior deploy
   instruction is **superseded** and issue a new one with the new SHA + its schema prerequisite.

3. **A runtime PR that adds a schema-manifest requirement is labeled
   `SCHEMA ACTIVATION REQUIRED BEFORE DEPLOY`** in its title/description, naming the activation
   script and approval phrase.

4. **Every deploy handoff carries exactly one verdict:** `DEPLOYABLE NOW` or
   `NOT DEPLOYABLE — ACTIVATE SCHEMA FIRST` (with the activation script + approval phrase).

5. **Before every manual deploy, compare four values:** intended SHA · Render checkout SHA ·
   current `main` SHA · required schema version. If they disagree, stop and reconcile.

6. **Never combine** "deploy continuity commit X" with "deploy latest main" once Stage-2 (or any
   manifest-extending) commits have merged. The two are contradictory the moment `main` diverges
   from X.

7. **Run the preflight before deploying** (the CI/release artifact this incident produced):

   ```
   node --require dotenv/config --import tsx scripts/deploy-preflight-schema.ts
   ```

   It runs the SAME `checkSchemaManifest` the startup boot guard runs against the target DB and
   prints `✅ DEPLOYABLE NOW` (exit 0) or `⛔ NOT DEPLOYABLE — ACTIVATE SCHEMA FIRST` (exit 2) with
   the exact missing tables/columns. A green preflight means the deploy will not crash-loop on
   `STARTUP_SCHEMA_INCOMPATIBLE`. Read-only; credentials redacted.

## Coordinated release sequence for a manifest-extending commit

1. Merge the additive schema substrate (Prisma model + `scripts/activate-<table>-prod-schema.ts`),
   **deploy-inert** — no manifest entry, no consumer.
2. Merge the runtime PR (query/service/routes + the manifest entry + tests), labeled
   `SCHEMA ACTIVATION REQUIRED BEFORE DEPLOY`.
3. **Activate prod schema FIRST:** run the approval-phrase-gated activation script against prod
   (additive, idempotent, `IF NOT EXISTS`, transaction + `SET LOCAL` timeouts, read-only verify).
4. **Preflight:** run `deploy-preflight-schema.ts` against prod → require `✅ DEPLOYABLE NOW`.
5. **Deploy the exact commit** (pinned SHA, not "latest") to `otzar-api`; poll to terminal success;
   confirm the checkout SHA matches; confirm startup logs show manifest passed + listen + no loop.
6. Post-deploy: `/health` 200, obligations routes auth-gated (not 404), no 5xx increase, no leak.
