#!/bin/bash
# Appends one entry to the append-only defect log. Called by the
# code-reviewer agent (source=review) whenever it fixes a Critical/Warning
# before writing .review-pass, and by the incident playbook (source=incident)
# for anything caught after shipping.
set -euo pipefail
SEVERITY="" CLASS="" FILES="" SOURCE="" COMMIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --severity) SEVERITY="$2"; shift 2 ;;
    --class) CLASS="$2"; shift 2 ;;
    --files) FILES="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
: "${SEVERITY:?--severity required (Critical|Warning|Suggestion)}"
: "${CLASS:?--class required — name the CLASS the bug belongs to (DEFECT_DISCIPLINE Rule 1), not just this instance}"
: "${SOURCE:?--source required (review|incident|prod)}"
if [ -z "$COMMIT" ]; then
  COMMIT=$(git rev-parse HEAD 2>/dev/null) || COMMIT="unknown"
fi

mkdir -p .claude
KLOC=$(scripts/count-kloc.sh 2>/dev/null || echo "0")
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

jq -nc \
  --arg date "$DATE" --arg severity "$SEVERITY" --arg class "$CLASS" \
  --arg files "$FILES" --arg source "$SOURCE" --arg commit "$COMMIT" \
  --arg kloc "$KLOC" \
  '{date:$date, severity:$severity, class:$class, files:($files|split(",")), source:$source, commit:$commit, kloc_at_fix:($kloc|tonumber)}' \
  >> .claude/defects.jsonl

echo "Logged: $SEVERITY / $CLASS ($SOURCE) at $KLOC KLOC → .claude/defects.jsonl"
