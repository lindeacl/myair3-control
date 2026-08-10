#!/bin/bash
# PreToolUse gate: block `git push` unless a matching push-approval marker is on
# record for the current HEAD. Runs before every Bash tool call (main thread and
# subagents). Exit 2 blocks and feeds the message back to Claude.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

echo "$COMMAND" | grep -qE '\bgit\s+((-{1,2}[^ ]+|-c\s+[^ ]+)\s+)*push\b' || exit 0

MARKER=".claude/.push-approved"
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)

if [ ! -f "$MARKER" ]; then
  echo "Blocked: no push approval on record for HEAD ($HEAD_SHA). Ask the user to explicitly confirm THIS push in THIS turn, then write \"$HEAD_SHA\" to $MARKER before retrying." >&2
  exit 2
fi

APPROVED_SHA=$(cat "$MARKER")
if [ "$APPROVED_SHA" != "$HEAD_SHA" ]; then
  echo "Blocked: push approval is stale (approved $APPROVED_SHA, HEAD is now $HEAD_SHA). Re-confirm with the user before pushing — do not reuse an old approval." >&2
  exit 2
fi
exit 0
