#!/bin/bash
# Scaffolds a scratch directory (.claude/.canary-scratch-<id>/) with
# ONE canary's buggy snippet written to a file, ready for a live agent
# session to delegate to code-reviewer against directly (no git worktree,
# no staging — the reviewer is pointed at the file itself, not at
# `git diff --cached`). Fully scriptable — no subagent invocation happens
# here, that's the next manual/agent-driven step (see CLAUDE.md's "Reviewer
# canary policy" section).
#
# Usage: scripts/setup-canary.sh <canary-id>
set -euo pipefail
ID="${1:?Usage: setup-canary.sh <canary-id>}"
MANIFEST="canary-manifest.json"

CANARY=$(jq -c --arg id "$ID" '.canaries[] | select(.id == $id)' "$MANIFEST")
if [ -z "$CANARY" ]; then
  echo "No canary found with id '$ID' in $MANIFEST" >&2
  exit 1
fi

SCRATCH_DIR=".claude/.canary-scratch-$ID"
rm -rf "$SCRATCH_DIR"
mkdir -p "$SCRATCH_DIR"

BUGGY=$(echo "$CANARY" | jq -r '.buggy_snippet')
DESC=$(echo "$CANARY" | jq -r '.description')
SEVERITY=$(echo "$CANARY" | jq -r '.severity_expected')
CHECKLIST_ITEM=$(echo "$CANARY" | jq -r '.checklist_item')
# lang_ext lets the manifest carry non-JS snippets (see "Adapting to
# another language") — defaults to js for the starting canaries above.
LANG_EXT=$(echo "$CANARY" | jq -r '.lang_ext // "js"')
CANARY_FILE="$SCRATCH_DIR/canary.$LANG_EXT"

cat > "$CANARY_FILE" <<EOF
// CANARY $ID — DO NOT MERGE — deliberately buggy for reviewer-quality testing
// Expected finding: $SEVERITY ($CHECKLIST_ITEM) — $DESC
$BUGGY
EOF

echo "Canary '$ID' scaffolded at $CANARY_FILE"
echo "  Class:            $(echo "$CANARY" | jq -r '.class')"
echo "  Checklist item:   $CHECKLIST_ITEM"
echo "  Expected finding: $SEVERITY"
echo ""
echo "Next: delegate to the code-reviewer subagent against $CANARY_FILE"
echo "and confirm it flags the $CHECKLIST_ITEM issue at $SEVERITY or above."
echo "Then run: scripts/log-canary-result.sh --id $ID --result pass|fail"
