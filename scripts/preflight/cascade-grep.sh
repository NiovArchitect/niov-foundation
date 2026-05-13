#!/usr/bin/env bash
# FILE: scripts/preflight/cascade-grep.sh
# PURPOSE: Pre-flight cascade-target inventory — greps docs/ + CLAUDE.md +
#          AGENTS.md for ADR-cascade / RULE-cascade / post-commit-hash-cascade
#          patterns. Surfaces the full cascade landscape before authorization,
#          preventing scope-undercount catches (the dual-control arc surfaced
#          7 of those across 26 catches, ~27% of the arc total). Advisory
#          output — the reviewer confirms each match in-or-out of scope; this
#          script does not replace RULE 12 / RULE 13 / RULE 18, it feeds them.
# CONNECTS TO:
#   docs/architecture/decisions/0029-substrate-build-optimizations.md
#     (the decision document; this is Optimization 1 — sub-phase 2 of the
#     SUBSTRATE-BUILD-OPTIMIZATIONS arc).
#   scripts/preflight/README.md (usage notes).
# WHY: A "scope-undercount catch" is a cascade target the planned scope
#      missed but a grep would have surfaced — invisible to recall, visible
#      to pattern search. Mechanizing the grep at pre-flight tier lets the
#      reviewer see the full landscape before drafting edits. Pre-flight
#      tier, not commit tier — this script is run by hand (or by Claude
#      Code) before authorization; the .husky/pre-commit hook stays
#      enforcement-only (db-push guard + typecheck + RULE 16).
# USAGE:
#   scripts/preflight/cascade-grep.sh adr <N>     # ADR-<N> cascade patterns
#   scripts/preflight/cascade-grep.sh rule <N>    # RULE-<N> cascade patterns
#   scripts/preflight/cascade-grep.sh hash        # post-commit-hash patterns
#   scripts/preflight/cascade-grep.sh all <N>     # adr + rule + hash combined
#   scripts/preflight/cascade-grep.sh --self-test
#   scripts/preflight/cascade-grep.sh --help

set -euo pipefail

# Run from repo root so the relative search paths resolve regardless of
# the caller's cwd. Fails closed if not in a git repo (which is the only
# context this script is meaningful in).
cd "$(git rev-parse --show-toplevel)"

# Search paths — the canonical surfaces a cascade target might live on.
# Keep this list small + meaningful; extending it should be a deliberate
# decision (each new path widens the grep + risks false positives).
SEARCH_PATHS=("docs/" "CLAUDE.md" "AGENTS.md")

# Light color if the output is a TTY — purely cosmetic; the matched-pattern
# lines remain greppable.
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""
fi

usage() {
  cat <<'EOF'
cascade-grep.sh — pre-flight cascade-target inventory

Usage:
  scripts/preflight/cascade-grep.sh <subcommand> [args]

Subcommands:
  adr <N>          ADR-cascade patterns for ADR-<N>
                   Greps: "<N> ADRs" / "the <N> ADRs" / "ADR-00<N>" /
                          "ADR-0001 through ADR-00<N>" / ADR-catalog markers
  rule <N>         RULE-cascade patterns for RULE <N>
                   Greps: "RULE <N>" / "<N> RULES" / "RULES 12-<N>" /
                          preamble + §3-intro RULE-count phrasings
  hash             post-commit-hash placeholders + arc-hash chains
                   Greps: "this commit" / "forward: ADR-<N>" /
                          "sub-phase <X> forward" / multi-hash arc chains
  all <N>          adr <N> + rule <N> + hash (typical for new-ADR + RULE landings)
  --self-test      assert known patterns exist against current repo state
                   (canary; failures indicate either a script bug or substrate drift)
  --help, -h       this message

Search paths: docs/ + CLAUDE.md + AGENTS.md
Output:       file:line: matched-pattern  (one match per line; advisory)
Exit:         0 (advisory; --self-test exits 1 on assertion failure)

This tool is ADVISORY. The reviewer (operator or Claude Code) confirms each
match is in the planned cascade or deliberately out of scope, before
authorizing edits. It does not replace RULE 12 (pre-flight grep), RULE 13
(surface drifts), or RULE 18 (verify operation type / substrate-state) —
it feeds them.

See: docs/architecture/decisions/0029-substrate-build-optimizations.md
EOF
}

# Print a section header to delimit subcommand output groups.
section() {
  printf '%s=== %s ===%s\n' "$BOLD" "$1" "$RESET"
}

# Run a grep over the SEARCH_PATHS, suppressing the non-match exit code so
# `set -e` doesn't kill the script when a pattern legitimately finds nothing.
# Empty output is itself a substrate-state observation (the pattern is absent).
cascade_grep() {
  local pattern=$1
  grep -rnE "$pattern" "${SEARCH_PATHS[@]}" 2>/dev/null || true
}

grep_adr() {
  local n=$1
  local n_padded
  n_padded=$(printf "%04d" "$n")
  section "ADR cascade for ADR-${n_padded} (N=${n})"
  cascade_grep "(^|[^[:alnum:]])${n} ADRs([^[:alnum:]]|$)|the ${n} ADRs|ADR-${n_padded}|ADR-0001 through ADR-${n_padded}"
  echo ""
  section "ADR catalog / jump-table marker references"
  cascade_grep "ADR catalog as of|jump.?table" | head -20
}

grep_rule() {
  local n=$1
  section "RULE cascade for RULE ${n}"
  cascade_grep "(^|[^[:alnum:]])RULE ${n}([^[:alnum:]]|$)|(^|[^[:alnum:]])${n} RULES([^[:alnum:]]|$)|RULES 12-${n}|RULES 12-${n}; RULE 11 vacant"
  echo ""
  section "Preamble + §3-intro RULE-count phrasings (CLAUDE.md)"
  grep -nE "RULES \(0-10\)|RULES 12-[0-9]+|the .* preserved RULES" CLAUDE.md 2>/dev/null || true
}

grep_hash() {
  section "Post-commit-hash placeholders ('this commit' / 'forward: ADR-N' / 'sub-phase X forward')"
  cascade_grep "this commit|forward: ADR-[0-9]+|sub-phase [A-Z] forward|sub-phase [0-9]+ forward"
  echo ""
  section "Arc-hash chain candidates (lines with 3+ short-hash tokens)"
  cascade_grep "[0-9a-f]{7}.*[0-9a-f]{7}.*[0-9a-f]{7}" | head -20
}

# --self-test: canary assertions against the current repo state.
# Each known pattern is a substrate-state invariant at HEAD. A failure
# means either (a) the script's regex drifted from the substrate, or
# (b) the substrate drifted from the canonical state — both are
# substrate-state observations worth surfacing per RULE 13.
self_test() {
  local fail=0
  local got
  section "Self-test: canary patterns at HEAD"

  # Canary 1: ADR-0029 is the most recent ADR (29 ADRs canonical).
  if got=$(grep -rnE "ADR-0029" CLAUDE.md docs/architecture/README.md 2>/dev/null) && [ -n "$got" ]; then
    printf '%sPASS%s  ADR-0029 references found (CLAUDE.md + README)\n' "$GREEN" "$RESET"
  else
    printf '%sFAIL%s  expected ADR-0029 reference in CLAUDE.md / docs/architecture/README.md\n' "$RED" "$RESET"
    fail=1
  fi

  # Canary 2: RULE 20 is the most recent RULE (20 RULES canonical).
  if got=$(grep -rnE "RULE 20|20 RULES" CLAUDE.md docs/contributing/onboarding.md 2>/dev/null) && [ -n "$got" ]; then
    printf '%sPASS%s  RULE 20 / 20 RULES references found (CLAUDE.md + onboarding.md)\n' "$GREEN" "$RESET"
  else
    printf '%sFAIL%s  expected RULE 20 / 20 RULES reference in CLAUDE.md / onboarding.md\n' "$RED" "$RESET"
    fail=1
  fi

  # Canary 3: the permanent "this commit" placeholders in the
  # canonical-record §6 J-entry + section-12-progress.md row 33 (per
  # sub-phase J Decision 3 — the J-hash backfill strategy).
  if got=$(grep -nE "this commit" \
      docs/architecture/dual-control-operations-canonical-record.md \
      docs/reference/section-12-progress.md 2>/dev/null) && [ -n "$got" ]; then
    printf '%sPASS%s  "this commit" placeholders found (canonical-record + section-12-progress)\n' "$GREEN" "$RESET"
  else
    printf '%sFAIL%s  expected "this commit" placeholder in canonical-record §6 J-entry + section-12-progress row 33\n' "$RED" "$RESET"
    fail=1
  fi

  echo ""
  if [ "$fail" -eq 0 ]; then
    printf '%s=== Self-test PASSED ===%s\n' "$GREEN" "$RESET"
    return 0
  else
    printf '%s=== Self-test FAILED — either script bug or substrate drift; surface per RULE 13 ===%s\n' "$RED" "$RESET"
    return 1
  fi
}

# Main dispatcher.
case "${1:-}" in
  adr)
    [ -z "${2:-}" ] && { printf '%serror%s: adr requires N argument (e.g., "adr 29")\n' "$RED" "$RESET" >&2; usage >&2; exit 1; }
    grep_adr "$2"
    ;;
  rule)
    [ -z "${2:-}" ] && { printf '%serror%s: rule requires N argument (e.g., "rule 20")\n' "$RED" "$RESET" >&2; usage >&2; exit 1; }
    grep_rule "$2"
    ;;
  hash)
    grep_hash
    ;;
  all)
    [ -z "${2:-}" ] && { printf '%serror%s: all requires N argument (e.g., "all 29")\n' "$RED" "$RESET" >&2; usage >&2; exit 1; }
    grep_adr "$2"
    echo ""
    grep_rule "$2"
    echo ""
    grep_hash
    ;;
  --self-test)
    self_test
    ;;
  --help|-h|"")
    usage
    ;;
  *)
    printf '%serror%s: unknown subcommand: %s\n' "$RED" "$RESET" "$1" >&2
    usage >&2
    exit 1
    ;;
esac
