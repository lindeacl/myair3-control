#!/bin/bash
# PostToolUse hook (QUALITY_STANDARD.md §9 Tier 1, adapted for this stack):
# runs the fast mechanical check immediately after every Edit/Write to THIS
# repo's index.html, not just at commit time. This project has no tsc/eslint
# (no TS, no bundler) so there's no lint/type-check to run here -- the
# equivalent fast, real check for a bundler-free static-HTML project is
# scripts/check-html-js.mjs (parses every embedded <script> block, checks
# for duplicate static ids). Exit 2 sends the failure back to Claude as a
# blocking message; it does not undo the edit (the file already has the
# syntax error on disk) -- this is a fast self-correction loop, not a hard
# block. The real hard block is still the pre-commit hook.
#
# Scoping: the target is matched by RESOLVED ABSOLUTE PATH, not by filename.
# A `*/index.html` glob would also match any other repo's index.html -- e.g.
# the sibling `../ios-app/www/index.html` -- and would gate an edit there on
# this project's checker, reporting a failure about a file this repo doesn't
# own. .husky/pre-commit and .github/workflows/test.yml both pin the checker
# to `<repo>/index.html`; this hook targets exactly the same file.
#
# Fail-open by design: if the input can't be parsed or the path can't be
# resolved, this exits 0 and lets the edit stand. The pre-commit hook and CI
# are the real boundary -- this tier only makes failures surface sooner.
#
# Covered by scripts/test-check-after-edit.sh (run in CI).
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd -P) || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0

# Normalise `./index.html`, `../pwa/index.html` and symlinked paths to one
# physical path before comparing, so the match can't be dodged or spoofed by
# how the tool happened to spell the path.
ABS_DIR=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd -P) || exit 0
[ "$ABS_DIR/$(basename "$FILE_PATH")" = "$REPO_ROOT/index.html" ] || exit 0

if ! OUTPUT=$(node "$REPO_ROOT/scripts/check-html-js.mjs" "$REPO_ROOT/index.html" 2>&1); then
  echo "Blocked: index.html failed the mechanical check after this edit:" >&2
  echo "$OUTPUT" >&2
  echo "Fix it before continuing -- this doesn't undo the edit, it's a fast catch." >&2
  exit 2
fi
exit 0
