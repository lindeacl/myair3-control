#!/bin/bash
# PreToolUse gate: block a configured list of destructive infrastructure
# commands unless a fresh, command-specific approval marker is on record.
# Exit 2 blocks and feeds the message back to the agent.
#
# Plan-review sub-gate: commands matching
# .claude/infra-gate.plan-required.patterns (auto-approve/non-interactive
# applies, which skip the tool's own plan display) need a SECOND marker
# proving a plan/diff was captured and shown before the apply marker is
# honored. See infra-gate-kit.md for the full rationale.
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

PLAN_PATTERNS_FILE=".claude/infra-gate.plan-required.patterns"
if [ -f "$PLAN_PATTERNS_FILE" ]; then
  PLAN_MATCHED=""
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    case "$pattern" in \#*) continue ;; esac
    if echo "$COMMAND" | grep -qE "$pattern"; then
      PLAN_MATCHED=1
      break
    fi
  done < "$PLAN_PATTERNS_FILE"
  if [ -n "$PLAN_MATCHED" ]; then
    PLAN_MARKER=".claude/.infra-plan-reviewed-$CMD_HASH"
    if [ ! -f "$PLAN_MARKER" ]; then
      echo "Blocked: this command bypasses interactive plan display and needs a PLAN REVIEW recorded first, not just an apply confirmation." >&2
      echo "  Command: $COMMAND" >&2
      echo "  Run the read-only plan/diff equivalent, show it to the user, then:" >&2
      echo "    echo ok > $PLAN_MARKER" >&2
      exit 2
    fi
  fi
fi

if [ ! -f "$MARKER" ]; then
  echo "Blocked: this command matches a configured destructive-infra pattern in $PATTERNS_FILE." >&2
  echo "  Command: $COMMAND" >&2
  echo "  Ask the user to explicitly confirm THIS command in THIS turn, then run:" >&2
  echo "    echo ok > $MARKER" >&2
  exit 2
fi
exit 0
