#!/bin/bash
# Self-test for scripts/check-after-edit.sh.
#
# QUALITY_STANDARD.md §9 says a gate is not adopted until you have
# "deliberately introduce[d] a rule violation and confirm[ed] each tier
# catches it" -- and DEFECT_DISCIPLINE Rule 5/6 say a one-off manual check
# someone ran once in a session is a *believed* result, not an observed one,
# for everybody who comes after. This makes that verification repeatable and
# runs it in CI, so a later edit to the hook's matching logic can't silently
# disable it.
#
# The hook derives its repo root from $0, so each case runs against a throwaway
# fake repo root -- the real index.html is never touched.
set -u

HOOK_SRC=$(cd "$(dirname "$0")" && pwd -P)/check-after-edit.sh
CHECKER_SRC=$(cd "$(dirname "$0")" && pwd -P)/check-html-js.mjs
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAKE_ROOT="$TMP/repo"
mkdir -p "$FAKE_ROOT/scripts" "$TMP/elsewhere"
cp "$HOOK_SRC" "$FAKE_ROOT/scripts/check-after-edit.sh"
cp "$CHECKER_SRC" "$FAKE_ROOT/scripts/check-html-js.mjs"
HOOK="$FAKE_ROOT/scripts/check-after-edit.sh"

GOOD='<!doctype html><html><body><div id="a"></div><script>const x = 1;</script></body></html>'
# Two elements sharing an id -- the exact bug class check-html-js.mjs exists
# to catch (it silently breaks every getElementById lookup in the file).
BAD='<!doctype html><html><body><div id="a"></div><div id="a"></div><script>const x = 1;</script></body></html>'

fails=0
check() { # name expected_exit stdin_json
  local name=$1 expected=$2 payload=$3 out actual
  out=$(printf '%s' "$payload" | "$HOOK" 2>&1)
  actual=$?
  if [ "$actual" != "$expected" ]; then
    echo "✖ $name: expected exit $expected, got $actual"
    [ -n "$out" ] && echo "  output: $out"
    fails=$((fails + 1))
  else
    echo "✓ $name (exit $actual)"
  fi
}

payload() { printf '{"tool_input":{"file_path":"%s"}}' "$1"; }

# 1. Clean index.html in the repo root -> passes.
printf '%s' "$GOOD" > "$FAKE_ROOT/index.html"
check "clean index.html passes" 0 "$(payload "$FAKE_ROOT/index.html")"

# 2. Broken index.html in the repo root -> blocks with exit 2.
printf '%s' "$BAD" > "$FAKE_ROOT/index.html"
check "duplicate-id index.html blocks" 2 "$(payload "$FAKE_ROOT/index.html")"

# 3. Same broken content, but a DIFFERENT repo's index.html. Regression test
#    for the original `*/index.html` glob, which matched any index.html
#    anywhere (including the sibling ios-app/www/index.html) and reported
#    this repo's checker failing on a file this repo doesn't own.
printf '%s' "$BAD" > "$TMP/elsewhere/index.html"
check "foreign index.html is ignored" 0 "$(payload "$TMP/elsewhere/index.html")"

# 4. A relative spelling of the same file still resolves to the target.
printf '%s' "$BAD" > "$FAKE_ROOT/index.html"
check "relative ./ path still matches" 2 "$(payload "$FAKE_ROOT/./index.html")"

# 5. Non-index files are ignored.
printf '%s' "$BAD" > "$FAKE_ROOT/other.html"
check "non-index file ignored" 0 "$(payload "$FAKE_ROOT/other.html")"

# 6. Nonexistent path -> no crash, no block.
check "nonexistent path ignored" 0 "$(payload "$FAKE_ROOT/nope/index.html")"

# 7. Malformed / non-JSON stdin -> fails open quietly, does not block edits.
check "malformed stdin fails open" 0 'not json at all'
check "empty stdin fails open" 0 ''

# 8. Tool payload with no file_path (e.g. NotebookEdit) -> ignored.
check "payload without file_path ignored" 0 '{"tool_input":{"notebook_path":"/x/index.html"}}'

if [ "$fails" -gt 0 ]; then
  echo "❌ check-after-edit.sh self-test: $fails case(s) failed." >&2
  exit 1
fi
echo "✅ check-after-edit.sh self-test: all cases passed."
