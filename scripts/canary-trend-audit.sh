#!/bin/bash
# Reports the rolling pass rate over the last N canary runs and flags a
# declining trend. Deliberately NOT a release gate — informational, same as
# density-trend-audit.sh without --enforce. A human decides what to do with
# a declining reviewer pass rate; this pack doesn't auto-block a release on
# a synthetic test result.
#
# Usage: scripts/canary-trend-audit.sh [n-runs]   (default: 10)
set -euo pipefail
N="${1:-10}"
RESULTS=".claude/canary-results.jsonl"

if [ ! -f "$RESULTS" ] || [ "$(wc -l < "$RESULTS" | tr -d ' ')" -eq 0 ]; then
  echo "No canary runs recorded yet. Run scripts/setup-canary.sh against each"
  echo "entry in canary-manifest.json, then scripts/log-canary-result.sh."
  exit 0
fi

RECENT=$(tail -n "$N" "$RESULTS")
TOTAL=$(echo "$RECENT" | wc -l | tr -d ' ')
PASSES=$(echo "$RECENT" | jq -sc '[.[] | select(.result=="pass")] | length')
RATE=$(python3 -c "print(round(100 * $PASSES / $TOTAL, 1))")

echo "── Reviewer Canary Trend (last $TOTAL runs) ────────────"
echo "$RECENT" | jq -r '"  \(.date)  \(.canary_id)  \(.result)" + (if .notes != "" then "  — " + .notes else "" end)'
echo "───────────────────────────────────────────────────────────"
echo "Pass rate: $PASSES/$TOTAL ($RATE%)"

FAILING_CLASSES=$(echo "$RECENT" | jq -sc '[.[] | select(.result=="fail") | .canary_id] | unique')
FAIL_COUNT=$(echo "$FAILING_CLASSES" | jq 'length')

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "" >&2
  echo "⚠️  Recent misses on: $(echo "$FAILING_CLASSES" | jq -r 'join(", ")')" >&2
  echo "This is informational, not a release gate. Per QUALITY_STANDARD.md §5" >&2
  echo "(independent review), consider: is the reviewer checklist stale, is the" >&2
  echo "model/prompt drifting, or was this specific canary miscalibrated?" >&2
fi
