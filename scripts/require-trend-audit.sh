#!/bin/bash
# PreToolUse gate: block a release/tag command unless the density trend
# audit passes, OR — if it's regressing — a written override with a real
# reason is on record for the CURRENT history-file state.
# EDIT RELEASE_PATTERN to match this project's actual release command
# (should match require-release-density.sh's pattern).
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

RELEASE_PATTERN='(\bgit\s+tag\s+v[0-9])|(\bgh\s+release\s+create\b)|(\bnpm\s+version\b)'
echo "$COMMAND" | grep -qE "$RELEASE_PATTERN" || exit 0

HISTORY=".claude/density-history.jsonl"
[ -f "$HISTORY" ] || exit 0   # no history yet — nothing to audit, same as the underlying script

if scripts/density-trend-audit.sh --enforce >/tmp/trend-audit-output.$$ 2>&1; then
  rm -f /tmp/trend-audit-output.$$
  exit 0   # improving/flat/not-enough-history — frictionless pass, no marker needed
fi

# Regressing: require a written override, keyed to the CURRENT history file
# content — a new release snapshot changes the hash and invalidates any
# prior override, so an old justification can never silently cover a new
# regression.
HISTORY_HASH=$(shasum -a 256 "$HISTORY" | cut -d' ' -f1)
OVERRIDE=".claude/.trend-audit-override-$HISTORY_HASH"

if [ ! -s "$OVERRIDE" ]; then
  echo "Blocked: defect density is NOT trending toward target (see below) and no" >&2
  echo "override with a stated reason is on record for the current history state." >&2
  cat /tmp/trend-audit-output.$$ >&2
  rm -f /tmp/trend-audit-output.$$
  echo "" >&2
  echo "Ask the user whether to proceed despite the regression. If yes, write the" >&2
  echo "ACTUAL REASON (not just 'ok') to:" >&2
  echo "  $OVERRIDE" >&2
  echo "e.g.: echo 'Known regression — root cause is the Q3 vendor migration," >&2
  echo "tracked in ADR-0042, fix scheduled for next release.' > $OVERRIDE" >&2
  exit 2
fi
rm -f /tmp/trend-audit-output.$$
echo "⚠️  Releasing despite a density-trend regression — override on record:" >&2
cat "$OVERRIDE" >&2
exit 0
