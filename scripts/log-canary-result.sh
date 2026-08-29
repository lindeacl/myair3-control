#!/bin/bash
# Records one canary run's outcome. Called by whoever (agent or human)
# evaluated whether code-reviewer caught the planted defect.
#
# Usage:
#   scripts/log-canary-result.sh --id sqli-001 --result pass
#   scripts/log-canary-result.sh --id sqli-001 --result fail --notes "flagged as Suggestion, not Critical — severity miscalibrated"
set -euo pipefail
CANARY_ID="" RESULT="" NOTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --id) CANARY_ID="$2"; shift 2 ;;
    --result) RESULT="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
: "${CANARY_ID:?--id required}"
: "${RESULT:?--result required (pass|fail)}"
case "$RESULT" in pass|fail) ;; *) echo "--result must be pass or fail" >&2; exit 1 ;; esac

mkdir -p .claude
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq -nc --arg date "$DATE" --arg id "$CANARY_ID" --arg result "$RESULT" --arg notes "$NOTES" \
  '{date:$date, canary_id:$id, result:$result, notes:$notes}' \
  >> .claude/canary-results.jsonl

rm -rf ".claude/.canary-scratch-$CANARY_ID"
echo "Logged: $CANARY_ID = $RESULT"
