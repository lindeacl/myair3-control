#!/bin/bash
# PreToolUse hook: runs alongside require-merge-approval.sh on the same
# merge-command pattern. NEVER blocks — this only counts gated merges and
# queues every 10th one for a later, asynchronous re-review. Exit 0 always.
#
# Honest limitation: this counts merges that PASSED the gate (both markers
# valid) and were ALLOWED to run — not confirmed-successful remote merges.
# A hook fires before the tool call executes, so it can't see whether the
# actual GitHub/Azure DevOps API call later succeeded. If the merge command
# subsequently fails remotely, this still counted it. For sampling purposes
# this is an acceptable approximation — re-reviewing a diff that didn't
# actually land yet is still a valid, harmless exercise, not a false signal
# about a real merge that didn't happen.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

MATCHED=""
if echo "$COMMAND" | grep -qE '\bgh\b' && echo "$COMMAND" | grep -qE '\bpr\s+merge\b'; then
  MATCHED=1
elif echo "$COMMAND" | grep -qE 'pullrequests/[0-9]+\?api-version' \
  && echo "$COMMAND" | grep -qE '(-X|--request)\s*PATCH'; then
  MATCHED=1
fi
[ -z "$MATCHED" ] && exit 0

PR=$(echo "$COMMAND" | sed -E 's/[A-Za-z][A-Za-z0-9]*//g' | grep -oE '[0-9]+' | head -1)
[ -z "$PR" ] && exit 0

# Only count merges that actually passed require-merge-approval.sh's own
# gate — re-derive the same check rather than trust a side-channel, so this
# script can never queue something that's still blocked.
REVIEW_MARKER=".claude/.pr-review-pass-$PR"
MERGE_MARKER=".claude/.merge-approved-$PR"
[ -f "$REVIEW_MARKER" ] && [ -f "$MERGE_MARKER" ] || exit 0
[ "$(cat "$REVIEW_MARKER")" = "$(cat "$MERGE_MARKER")" ] || exit 0

COUNTER_FILE=".claude/.merge-audit-counter"
mkdir -p .claude
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

if [ $((COUNT % 10)) -eq 0 ]; then
  DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  SHA=$(cat "$MERGE_MARKER")
  jq -nc --arg pr "$PR" --arg sha "$SHA" --arg date "$DATE" \
    '{pr_number:$pr, merged_sha:$sha, date:$date}' >> .claude/pr-audit-queue.jsonl
  echo "PR #$PR queued for audit (merge #$COUNT — every 10th sampled)." >&2
fi
exit 0
