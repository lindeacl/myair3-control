#!/bin/bash
# PostToolUse hook: runs after every Edit/Write.
#
# EDITED for this project's real stack: no TypeScript, no bundler, no
# eslint/ruff installed (package.json has zero lint/type-check
# devDependencies — see CLAUDE.md's "Agent Topology" section). Calling
# `npx tsc`/`npx eslint` here would silently try to download those packages
# on every single edit (slow, network-dependent, and would spuriously block
# edits to e2e/*.js and scripts/*.mjs that this project never intended to
# lint that way).
#
# The real equivalent fast check for this project is already wired as a
# SEPARATE PostToolUse hook: scripts/check-after-edit.sh, which runs
# scripts/check-html-js.mjs against index.html specifically (parses every
# embedded <script> block, checks for duplicate static ids — this project's
# stand-in for tsc/eslint, per CLAUDE.md). Keep that hook as the one doing
# real work; this script stays a documented no-op so a future `npm install
# eslint` (or similar) has an obvious place to wire in without hunting for
# where the PostToolUse gate lives.
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.py)
    # No TypeScript or Python in this project — nothing to do.
    exit 0
    ;;
  *.js|*.jsx|*.mjs)
    # No eslint installed. If one is added later, wire it here — e.g.:
    #   command -v npx >/dev/null 2>&1 && [ -f node_modules/.bin/eslint ] && \
    #     npx eslint "$FILE" 2>&1 | head -30
    exit 0
    ;;
  *) exit 0 ;;
esac
