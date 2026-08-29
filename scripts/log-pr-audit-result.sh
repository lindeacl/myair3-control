#!/bin/bash
# Records one PR audit's outcome.
#
# Usage:
#   scripts/log-pr-audit-result.sh --pr 142 --result confirmed
#   scripts/log-pr-audit-result.sh --pr 142 --result found_new_issue \
#     --severity Warning --notes "missed a missing null check on line 88"
set -euo pipefail
PR="" RESULT="" SEVERITY="" NOTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pr) PR="$2"; shift 2 ;;
    --result) RESULT="$2"; shift 2 ;;
    --severity) SEVERITY="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
: "${PR:?--pr required}"
: "${RESULT:?--result required (confirmed|found_new_issue)}"
case "$RESULT" in confirmed|found_new_issue) ;; *) echo "--result must be confirmed or found_new_issue" >&2; exit 1 ;; esac

mkdir -p .claude
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq -nc --arg date "$DATE" --arg pr "$PR" --arg result "$RESULT" \
  --arg severity "$SEVERITY" --arg notes "$NOTES" \
  '{date:$date, pr_number:$pr, result:$result, severity:$severity, notes:$notes}' \
  >> .claude/pr-audit-results.jsonl

rm -f ".claude/.pr-audit-scratch-$PR.diff"
echo "Logged: PR #$PR = $RESULT"
