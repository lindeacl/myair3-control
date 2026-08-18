#!/bin/bash
# PreToolUse gate: block a release/tag command unless defect-density.sh has
# been run with --enforce and passed for the CURRENT defect log state.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

RELEASE_PATTERN='(\bgit\s+tag\s+v[0-9])|(\bgh\s+release\s+create\b)|(\bnpm\s+version\b)'
echo "$COMMAND" | grep -qE "$RELEASE_PATTERN" || exit 0

LOG=".claude/defects.jsonl"
[ -f "$LOG" ] || touch "$LOG"
DEFECT_LOG_HASH=$(shasum -a 256 "$LOG" | cut -d' ' -f1)
MARKER=".claude/.density-pass-$DEFECT_LOG_HASH"

if [ ! -f "$MARKER" ]; then
  echo "Blocked: no passing defect-density check on record for the current defect log state." >&2
  echo "  Run: scripts/defect-density.sh --enforce" >&2
  echo "  Then: shasum -a 256 $LOG | cut -d' ' -f1 | xargs -I{} touch .claude/.density-pass-{}" >&2
  exit 2
fi
exit 0
