#!/bin/bash
# Reports the rate of re-reviews that found something the original review
# missed, over the last N audits. Informational, same as
# canary-trend-audit.sh — this is the real quality signal itself; what to
# do with it is a human decision, not something this pack auto-gates.
#
# Usage: scripts/pr-audit-trend-audit.sh [n-audits]   (default: 10)
set -euo pipefail
N="${1:-10}"
RESULTS=".claude/pr-audit-results.jsonl"

if [ ! -f "$RESULTS" ] || [ "$(wc -l < "$RESULTS" | tr -d ' ')" -eq 0 ]; then
  echo "No PR audits recorded yet. Run scripts/setup-pr-audit.sh, delegate the"
  echo "re-review, then scripts/log-pr-audit-result.sh."
  exit 0
fi

RECENT=$(tail -n "$N" "$RESULTS")
TOTAL=$(echo "$RECENT" | wc -l | tr -d ' ')
MISSED=$(echo "$RECENT" | jq -sc '[.[] | select(.result=="found_new_issue")] | length')
RATE=$(python3 -c "print(round(100 * $MISSED / $TOTAL, 1))")

echo "── PR Audit Trend (last $TOTAL audited PRs) ────────────"
echo "$RECENT" | jq -r '"  \(.date)  PR #\(.pr_number)  \(.result)" + (if .notes != "" then "  — " + .notes else "" end)'
echo "───────────────────────────────────────────────────────────"
echo "Original review missed something in $MISSED/$TOTAL sampled PRs ($RATE%)."

if [ "$MISSED" -gt 0 ]; then
  echo "" >&2
  echo "⚠️  $MISSED/$TOTAL sampled real PRs had something the original review" >&2
  echo "missed. This is the actual review-quality signal — not synthetic." >&2
  echo "Compare against REVIEWER_CANARY.md's trend: if the canary is passing" >&2
  echo "but real-PR audits are finding misses, the gap is likely deadline" >&2
  echo "pressure or diff size, not reviewer capability — check review-size" >&2
  echo "distribution (QUALITY_STANDARD.md §5) before assuming the checklist" >&2
  echo "itself needs work." >&2
fi
