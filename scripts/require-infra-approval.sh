#!/bin/bash
# PreToolUse gate: block a configured list of destructive infrastructure
# commands unless a fresh, command-specific approval marker is on record.
# Exit 2 blocks and feeds the message back to the agent.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

PATTERNS_FILE=".claude/infra-gate.patterns"
[ -f "$PATTERNS_FILE" ] || exit 0

MATCHED=""
while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  case "$pattern" in \#*) continue ;; esac
  if echo "$COMMAND" | grep -qE "$pattern"; then
    MATCHED=1
    break
  fi
done < "$PATTERNS_FILE"
[ -z "$MATCHED" ] && exit 0

CMD_HASH=$(printf '%s' "$COMMAND" | shasum -a 256 | cut -d' ' -f1)
MARKER=".claude/.infra-approved-$CMD_HASH"

if [ ! -f "$MARKER" ]; then
  echo "Blocked: this command matches a configured destructive-infra pattern in $PATTERNS_FILE." >&2
  echo "  Command: $COMMAND" >&2
  echo "  Ask the user to explicitly confirm THIS command in THIS turn, then run:" >&2
  echo "    echo ok > $MARKER" >&2
  exit 2
fi
exit 0
