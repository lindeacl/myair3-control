#!/bin/bash
# Appends one entry to the append-only defect log. Called by the
# code-reviewer agent (source=review) whenever it fixes a Critical/Warning
# before writing .review-pass, and by the incident playbook (source=incident)
# for anything caught after shipping.
#
# Usage:
#   scripts/log-defect.sh --severity Critical --class "N+1 query" \
#     --files "src/api/foo.js,src/api/bar.js" --source review [--commit <sha>]
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
# NOTE: no apostrophe in this message. An unescaped `'` inside a
# `${VAR:?message}` expansion breaks bash's quote-matching even though the
# whole thing sits inside outer double quotes — caught the hard way (via
# `bash -n` failing with "unexpected EOF while looking for matching `'`",
# pointing at an unrelated later line) when a project applying this kit
# wrote "the bug's CLASS" here.
: "${CLASS:?--class required — name the bug CLASS per DEFECT_DISCIPLINE Rule 1, not just this instance}"
: "${SOURCE:?--source required (review|incident|prod)}"
if [ -z "$COMMIT" ]; then
  # NOT `$(git rev-parse HEAD 2>/dev/null || echo "unknown")` — when HEAD is
  # unresolvable (no commits yet), some git versions still print "HEAD" to
  # stdout before failing, and that partial output gets captured ALONGSIDE
  # the `|| echo` fallback inside the same $(...), producing "HEAD\nunknown"
  # instead of just "unknown" (caught in testing). Structuring the fallback
  # as a separate assignment instead of inside the substitution avoids it.
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
