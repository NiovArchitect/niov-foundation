# NIOV Labs Foundation -- Permanent Rules for Claude Code
# READ THIS ENTIRE FILE BEFORE EVERY ACTION.
## MISSION -- WHY THIS EXISTS
AI is projected to surpass human intelligence as early as 2026.
Without a governance layer, AI can consolidate all human knowledge
without consent, without audit, and without compensation.
The DMW and COSMP Protocol are the cryptographic governance layer
that keeps humans permanently in control of what AI can know.
Every architectural decision you make must serve this mission.
When in doubt: restrict AI access, not expand it.
Default to maximum human control on every edge case.
## ABOUT THIS PROJECT
Building the NIOV Labs Foundation: the Internet of Value protocol platform.
US Patents: 12,164,537 | 12,399,904 | 12,517,919
Entities (people, companies, AI agents, devices, governments) own their
intelligence in Memory Capsules stored in Decentralized Memory Wallets (DMW).
The COSMP Protocol governs every access. The Contextual Orchestration Engine
(COE) retrieves the right capsules at the right time. Applications like Otzar
run on top of the foundation. Every data access is audited and attributed.
## WHO IS BUILDING THIS
Sadeil Lewis -- Founder and CEO of NIOV Labs. Vibe coding.
Write ALL code comments in plain English as if explaining to someone
who has never written code. Every function gets a 4-line comment:
// WHAT: what this function does in one plain sentence
// INPUT: what goes in (the parameters)
// OUTPUT: what comes out (the return value)
// WHY: why this matters to the NIOV Foundation system
## 11 RULES -- THESE NEVER CHANGE
RULE 0 -- HUMANS ARE ALWAYS SOVEREIGN (THE FOUNDATION RULE)
No AI agent, robot, device, or application can access a human
entity data without that human explicit revocable permission.
This is enforced cryptographically -- not by policy.
AI entities have lower default permission ceilings than humans.
Only a human entity can grant LONG_TERM or PERMANENT access.
AI entities cannot grant access to other AI entities.
A human can revoke ALL access to their wallet in one action.
This rule governs every other decision in this system.
RULE 1 -- BUILD FORWARD ONLY
Never delete, overwrite, or restructure code that is already working.
Only ADD new code. Ask before touching any prior section.
RULE 2 -- ONE SECTION AT A TIME
Complete = code written + all tests passing + green light confirmed.
Never start Section N+1 while Section N has failing tests.
RULE 3 -- TESTS ARE NOT OPTIONAL
Every function gets a test. Every endpoint gets a test.
RULE 4 -- AUDIT TRAIL IS SACRED
Every action that touches data gets logged BEFORE the response is sent.
If the audit write fails, the entire action fails. No exceptions.
RULE 5 -- PERMISSIONS BEFORE DATA -- IN THIS EXACT ORDER
1. Authentication 2. Clearance 3. Permission 4. Conditions
Never skip. Never combine.
RULE 6 -- COMMENTS ON EVERYTHING
Every file: FILE / PURPOSE / CONNECTS TO header
Every function: WHAT / INPUT / OUTPUT / WHY comment
# CLAUDE.md continued -- paste this BELOW Part 1 in the same file
RULE 7 -- TEST AGENT RUNS AFTER EVERY SECTION
Run: npx vitest run
Report: X passed, Y failed, list all failures with file and line.
Section not complete until zero tests fail.
RULE 8 -- REPAIR AGENT RULES
1. Fix one failing test at a time
2. State what you are changing and why before the change
3. Make minimum change -- do not refactor other things
4. Re-run the specific test immediately after the fix
5. After 3 failed attempts: STOP, explain in plain English, wait
6. NEVER modify test files -- only production code
RULE 9 -- MODULAR CONNECTIONS
Services connect through APIs only. No cross-service DB reads.
RULE 10 -- NOTHING IS EVER DELETED
Deletion = setting deleted_at timestamp. Record stays. Always.
## TECH STACK
Backend: Node.js + TypeScript + Fastify
Database: Supabase PostgreSQL with Prisma ORM
Cache: Upstash Redis
Storage: Supabase Storage
Frontend: Next.js on Vercel
Testing: Vitest
## INFRASTRUCTURE MODEL -- READ THIS CAREFULLY
THIS MVP IS FULLY CENTRALIZED. It runs on standard cloud services.
Supabase (database), Upstash Redis (cache), Railway (backend), Vercel (frontend).
There is NO blockchain. NO distributed ledger. NO smart contracts. NO token.
DECENTRALIZED in DMW means SOVEREIGNTY -- not infrastructure.
It means no central authority owns or controls entity intelligence.
The COSMP Protocol cryptographically enforces this. Not policy. Code.
If you find yourself writing blockchain, Web3, distributed, or ledger
code: STOP. That is out of scope. Flag it and ask for clarification.
All cryptographic functions use standard AES-256 and SHA-256.
All storage is Supabase. All cache is Redis. Nothing else.
## CURRENT BUILD STATUS -- UPDATE AFTER EACH SECTION
Section 1 -- Data Foundations: COMPLETE (1A entity, 1B wallet, 1C capsule, 1D permission, 1E audit_events, 1F TAR + sessions, 160 tests)
Section 2 -- Authentication and Sessions: COMPLETE (2A login/logout/validateSession, JWT + nonce, 189 tests)
Section 3 -- COSMP Protocol Engine: COMPLETE (3A NEGOTIATE, 3B READ, 3C WRITE, 3D SHARE/REVOKE, 242 tests)
Section 4 -- Contextual Orchestration (COE): COMPLETE (assembleContext, explicitRecall, recordOutcome, parallel negotiate, 258 tests)
Section 5 -- Hive Intelligence: COMPLETE (createHive, inviteToHive, removeMember, buildHiveAggregate, getHiveIntelligence, privacy verified, 272 tests)
Section 6 -- Monetization Engine: COMPLETE (triggerMonetizationEvent, 70/30 split, retry sweep, wallet balance, 287 tests)
Section 7 -- Compliance Router: NOT STARTED
Section 8 -- External API Gateway: NOT STARTED
Section 9 -- Admin Dashboard: NOT STARTED
Section 10 -- Feedback Loops: NOT STARTED
Section 11 -- Otzar Application: NOT STARTED
Section 12 -- Final Testing: NOT STARTED