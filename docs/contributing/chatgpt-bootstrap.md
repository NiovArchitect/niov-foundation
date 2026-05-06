# ChatGPT Bootstrap

ChatGPT is consultative, not executive — no repo access, no
file reading, no code execution. It reads pasted content and
returns analysis or drafts. This file answers how to bring it
into the loop without hallucinating substrate it cannot see.

ChatGPT is **not named in the existing pre-Section-12
`AGENTS.md` or `claude.md`**; this file is the first
documentation. Phase 3b's replacement `AGENTS.md` formalizes
its scope alongside the other agents.

## ChatGPT's Role in the Agent Fleet

Good for:

- **Architectural sounding-board.** Paste an ADR draft; get
  critique on Decision / Consequences / Alternatives.
- **Document drafting where source fits in a paste.** Cover
  letters, partner-pitch language, SSP narrative paragraphs.
- **Patent claim cross-check.** Paste claim section + ADR;
  ask whether the ADR supports or weakens the claim's
  specificity (US 12,517,919 COSMP is the recurring case).
- **Vocabulary translation.** Procurement-speak vs.
  engineering-speak vs. counsel-speak for the same concept.
- **Quick syntactic sanity-check on TypeScript snippets**
  when booting Codex or Claude Code is overkill.

**Not** good for:

- Anything requiring repo access (no grep, no file reads,
  no citation verification against substrate).
- Test or code execution.
- Multi-turn editing where context persistence matters —
  ChatGPT's effective context is shorter and less stable
  than Claude Code's for long architectural sessions.
- Tasks where hallucinated substrate is costly. Do not
  ask "what does ADR-0006 say"; paste ADR-0006.

## The Anti-Hallucination Discipline

The most important section in this file. ChatGPT will
confidently describe substrate it has not seen — the
discipline exists so that confidence is not mistaken for
verification.

- **Never ask about file contents without pasting the file.**
  Asking "what does `getComplianceStateForCaller` do" without
  pasting the method body returns a guess.
- **Never ask ChatGPT to summarize an ADR by number.**
  "What does ADR-0006 say" returns a plausible summary of
  what an ADR with that number *might* say. Paste it.
- **Verify every citation in the response.** ChatGPT
  fabricates file paths, line numbers, function names, and
  git SHAs with high confidence. Check before acting.
- **Treat "best practice" claims as starting points, not
  facts.** "Standard pattern" / "industry best practice" is
  a search prompt, not a verified claim.
- **For substrate-honest drafting, use Claude Code.** The
  pre-flight-grep model needs repo access; ChatGPT is for
  consultative work where pasted-in content is the source.

## Bootstrapping a Productive Session

1. **Open a new session.** No carryover; ChatGPT does not
   reliably retain context across sessions.
2. **Paste the frame.** Repo name, current build-cycle
   section, role this turn (sounding-board / drafter /
   cross-checker).
3. **Paste the source material.** ADR, patent claim, draft,
   snippet — labeled with what it is.
4. **State the expected output.** Critique / draft /
   translation / sanity-check. Vague asks → vague output.
5. **Verify citations on the way back.** Check any cited
   paths/lines/SHAs against the repo before acting.

## Format Templates

Four copy-paste templates. Replace the *italic-bracketed*
labels with content; everything else stays verbatim.

### 5.1 ADR critique

```
niov-foundation, Section 12C.0.5. Acting as architectural
sounding-board for an ADR draft below. Critique the Decision /
Consequences / Alternatives structure: is the Decision
unambiguous? Do the Easier/Harder consequences cover both
sides honestly? Are Alternatives substantive or strawmen?

[paste ADR body verbatim]
```

### 5.2 Patent claim cross-check

```
Cross-checking patent claim vs. ADR. Below: (a) claim section,
(b) ADR. Does the ADR support or weaken the claim's
specificity? Where does language drift?

(a) [paste claim section]

(b) [paste ADR body]
```

### 5.3 Vocabulary translation

```
Translate this architectural concept from
[engineering-speak / procurement-speak / counsel-speak] into
[procurement-speak / counsel-speak / engineering-speak].
Preserve technical accuracy; change vocabulary and framing.

Concept:
[paste source paragraph]
```

### 5.4 Code snippet sanity-check

```
TypeScript snippet below. Sanity-check: any syntax errors,
obvious type errors, or logic bugs visible without seeing
the surrounding module? I have repo access; you do not — do
not infer what unimported symbols mean.

[paste snippet]
```

## Sibling Repo Cross-Reference

The sibling `otzar-control-tower` repo maintains a
`CONTEXT.md` (191 lines, untracked) with cross-repo state and
architectural inventory. **Not ChatGPT-specific** but
paste-ready as a bootstrap frame for cross-repo work.
Foundation has no equivalent `CONTEXT.md` today.

## Anti-Patterns

- **Do not let ChatGPT make architectural decisions.** Its
  output is input to your decision, not the decision.
- **Do not paste secrets, API keys, auth tokens, or
  `.env` contents.** Conversation logs may be retained;
  treat any paste as logged.
- **Do not use ChatGPT for substrate-verification work.**
  The substrate-honest drafting discipline (pre-flight grep,
  drift surfacing) needs repo access. Use Claude Code.
- **Do not ask ChatGPT to "remember" across sessions.** It
  doesn't, reliably. Re-paste the frame each session.

## See Also

- `docs/contributing/codex-vs-claude-code.md` — when to
  reach for a repo-running agent vs. a consultative one
- `docs/contributing/cursor-bootstrap.md` — Cursor IDE setup
- `docs/contributing/parallel-sessions.md` — concurrency.
  ChatGPT sessions are safe alongside repo-running agents
  (no working-tree access); avoid cross-contaminating
  context between sessions.
- `AGENTS.md` (Phase 3b replaces the current file) —
  multi-LLM router defining ChatGPT's scope
