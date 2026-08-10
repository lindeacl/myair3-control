#!/bin/bash
# PreToolUse gate: block a PR-merge command unless BOTH markers are present
# and fresh for the PR being merged — a clean independent review AND a
# separate human merge confirmation. Exit 2 blocks.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

MATCHED=""
if echo "$COMMAND" | grep -qE '\bgh\b' && echo "$COMMAND" | grep -qE '\bpr\s+merge\b'; then
  MATCHED=1
fi
[ -z "$MATCHED" ] && exit 0

PR=$(echo "$COMMAND" | sed -E 's/[A-Za-z][A-Za-z0-9]*//g' | grep -oE '[0-9]+' | head -1)
if [ -z "$PR" ]; then
  echo "Blocked: could not determine PR number from command; approve manually or fix this script's PR-number extraction." >&2
  exit 2
fi

REVIEW_MARKER=".claude/.pr-review-pass-$PR"
MERGE_MARKER=".claude/.merge-approved-$PR"

if [ ! -f "$REVIEW_MARKER" ]; then
  echo "Blocked: no clean independent review on record for PR #$PR. Run the reviewer against this PR's diff first." >&2
  exit 2
fi
if [ ! -f "$MERGE_MARKER" ]; then
  echo "Blocked: PR #$PR passed review, but merging still needs a separate, fresh human confirmation. Ask the user to confirm merging THIS PR in THIS turn, then write its head SHA to $MERGE_MARKER." >&2
  exit 2
fi

REVIEWED_SHA=$(cat "$REVIEW_MARKER")
APPROVED_SHA=$(cat "$MERGE_MARKER")
if [ "$REVIEWED_SHA" != "$APPROVED_SHA" ]; then
  echo "Blocked: the reviewed commit ($REVIEWED_SHA) and the merge-approved commit ($APPROVED_SHA) don't match — the PR moved since one of these was written. Re-review and re-confirm." >&2
  exit 2
fi
exit 0
