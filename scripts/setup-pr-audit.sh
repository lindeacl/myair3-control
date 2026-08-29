#!/bin/bash
# Pops the oldest queued-but-not-yet-audited PR (or a specific PR number if
# given) and fetches its real diff via pr-workflow-kit.md's pr-diff.sh —
# reused, not duplicated. Prints the exact re-review framing needed to
# partially mitigate code-reviewer's persistent project memory (see the
# independence note at the top of PR_AUDIT_SAMPLING.md).
#
# Usage: scripts/setup-pr-audit.sh [pr-number]
set -euo pipefail
QUEUE=".claude/pr-audit-queue.jsonl"
RESULTS=".claude/pr-audit-results.jsonl"

if [ $# -ge 1 ]; then
  PR="$1"
else
  [ -f "$QUEUE" ] || { echo "No PRs queued yet — nothing to audit." ; exit 0; }
  DONE_IDS=$( [ -f "$RESULTS" ] && jq -r '.pr_number' "$RESULTS" | sort -u || echo "")
  PR=$(jq -r '.pr_number' "$QUEUE" | sort -u | while read -r p; do
    echo "$DONE_IDS" | grep -qx "$p" || { echo "$p"; break; }
  done)
  if [ -z "$PR" ]; then
    echo "All queued PRs have already been audited."
    exit 0
  fi
fi

SCRATCH=".claude/.pr-audit-scratch-$PR.diff"
scripts/pr-diff.sh "$PR" > "$SCRATCH"

echo "PR #$PR diff saved to $SCRATCH"
echo ""
echo "── Re-review framing (read this before delegating) ─────────────────"
echo "Delegate to code-reviewer, but the task is NOT 'review this PR' — it's"
echo "a BLIND SECOND OPINION on already-approved work. Instruct it explicitly:"
echo ""
echo "  'Review the diff in $SCRATCH as if seeing it for the first time."
echo "   Do NOT consult memory of having reviewed PR #$PR before — if you"
echo "   recall reviewing it, disregard that recollection and evaluate the"
echo "   diff fresh. Would you approve this as-is? List anything you would"
echo "   flag, at any severity, even if it was already approved.'"
echo ""
echo "Then run: scripts/log-pr-audit-result.sh --pr $PR --result confirmed|found_new_issue"
