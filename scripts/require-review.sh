#!/bin/bash
# PreToolUse gate: block `git commit` unless a matching code-reviewer pass is on
# record. Runs before every Bash tool call (main thread and subagents).
# Exit 2 blocks and feeds the message back to Claude.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only gate git commit. Between `git` and `commit` allow flags and the
# `-c key=val` form, so `git -c user.name=x commit` is caught too. This is a
# forcing function, not a security boundary — sh -c, aliases and heredocs can
# still evade it; genuine enforcement belongs in CI or the git pre-commit hook.
echo "$COMMAND" | grep -qE '\bgit\s+((-{1,2}[^ ]+|-c\s+[^ ]+)\s+)*commit\b' || exit 0

MARKER=".claude/.review-pass"
if [ ! -f "$MARKER" ]; then
  echo "Blocked: no review on record. Delegate to the code-reviewer subagent first." >&2
  exit 2
fi

CURRENT=$(git diff --cached | shasum -a 256 | cut -d' ' -f1)
if [ "$CURRENT" != "$(cat "$MARKER")" ]; then
  echo "Blocked: staged changes differ from what was reviewed. Re-run code-reviewer." >&2
  exit 2
fi
exit 0
