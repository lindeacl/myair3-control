#!/bin/bash
# Compares the last N release-density snapshots and flags stagnation or
# regression — the automated version of QUALITY_STANDARD.md §7's "audit
# which section isn't being followed" trigger. Run manually, or wire into
# a periodic CI job (monthly is reasonable — this is a slow-moving trend,
# not a per-release gate). Pass --enforce to make this script exit 1 on a
# confirmed regression, for use by scripts/require-trend-audit.sh (§13) —
# without --enforce it always exits 0, same convention as defect-density.sh.
#
# Usage: scripts/density-trend-audit.sh [n-releases] [--enforce]
set -euo pipefail
N=3
ENFORCE=false
for arg in "$@"; do
  case "$arg" in
    --enforce) ENFORCE=true ;;
    *) N="$arg" ;;
  esac
done
HISTORY=".claude/density-history.jsonl"

if [ ! -f "$HISTORY" ] || [ "$(wc -l < "$HISTORY" | tr -d ' ')" -lt "$N" ]; then
  COUNT=$( [ -f "$HISTORY" ] && wc -l < "$HISTORY" | tr -d ' ' || echo 0)
  echo "Not enough history yet ($COUNT/$N releases recorded) — nothing to audit."
  echo "History accumulates automatically each time defect-density.sh --record runs at a release."
  exit 0
fi

RECENT=$(tail -n "$N" "$HISTORY")
echo "── Density Trend (last $N releases) ────────────────────"
echo "$RECENT" | jq -r '"  \(.tag)  \(.date)  \(.density) defects/KLOC"'
echo "───────────────────────────────────────────────────────────"

# Trend check: is the most recent density <= the oldest of the N window?
# (a coarse "not getting worse" check — not a strict monotonic requirement,
# since a single release can blip up on a small KLOC denominator; the
# question that matters is the WINDOW's direction, not every single step)
FIRST=$(echo "$RECENT" | head -1 | jq -r '.density')
LAST=$(echo "$RECENT" | tail -1 | jq -r '.density')
IMPROVING=$(python3 -c "print(1 if $LAST <= $FIRST else 0)")

if [ "$IMPROVING" = "1" ]; then
  echo "✅ Trending flat or down over the last $N releases ($FIRST → $LAST)."
  exit 0
fi

echo "⚠️  NOT trending toward target: $FIRST → $LAST over the last $N releases." >&2
echo "" >&2
echo "Per QUALITY_STANDARD.md §7: this is not a 'try harder' problem — audit" >&2
echo "which of Sections 1-6 is actually being followed vs. just documented:" >&2
echo "  §1 Spec before code       — are specs actually written, or skipped under deadline?" >&2
echo "  §2 Coding standard        — is the linter catching real violations or is it loosened?" >&2
echo "  §3 Test discipline        — check MUTATION_TESTING.md's score trend alongside this one" >&2
echo "  §4 Deterministic gates    — audit whether --no-verify / bypass usage has crept up" >&2
echo "  §5 Independent review     — check review-size distribution (git log diff stats) —" >&2
echo "                              are diffs drifting above the 200-400 line band?" >&2
echo "  §6 Defect feedback loop   — pull recent defects.jsonl entries and check whether" >&2
echo "                              'class' enumeration (Rule 1) is actually happening or" >&2
echo "                              entries just restate the instance" >&2

[ "$ENFORCE" = true ] && exit 1
exit 0
