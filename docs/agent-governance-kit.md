# Agent Governance Kit — portable across projects

A drop-in code-review enforcement + model-topology setup for Claude Code
projects. Framework- and language-agnostic — copy the portable files,
adjust the marked bits for this project's actual stack.

> ⚠️ **Never copy a project's `.claude/settings.json` `permissions` block between repos.**
> It holds machine-specific paths and (in the source repo) a leaked plaintext DB
> password. Copy ONLY the `hooks` block shown in step 3.

**Retrofit-safe on an existing project:** the installer prepends the
review-gate to an existing `.husky/pre-commit` rather than replacing it —
your project's own mechanical gates (formatter, linter, whatever's already
there) are kept, not clobbered. Same for `.claude/settings.json`'s `hooks`
block: merged in, `permissions` and any other kit's entries left untouched.

---

## Per-project setup checklist

1. Copy `.claude/agents/code-reviewer.md` (step 1) — verbatim; tune `model:` / checklist.
2. Copy `scripts/require-review.sh` (step 2) — `chmod +x scripts/require-review.sh`.
3. Copy `scripts/check-diff-size.sh` (step 2b) — `chmod +x`. Enforces
   `QUALITY_STANDARD.md` §5's review-size band (warns at 400 changed lines,
   hard-blocks in CI above 1,000) — previously documented only, not gated.
3b. **Test enforcement is now real, not a placeholder** (step 4's
   `.husky/pre-commit`, "Test enforcement" block) — auto-detects
   package.json/pytest/go/cargo and hard-blocks the commit on failure.
   Verify it picked the right command for this project, or set
   `.claude/test-command` to override. E2E stays a CI concern
   (`CI_TEMPLATES.md`) — deliberately not run at commit time.
4. Copy `scripts/lint-and-test.sh` (step 2c) — `chmod +x`. The `PostToolUse`
   fast self-correction loop `QUALITY_STANDARD.md` §9 Tier 1 calls for —
   distinct job from `require-review.sh`, runs after every `Edit`/`Write`
   instead of before `git commit`. Edit the commands inside for this
   project's actual lint/type/test scripts.
5. Merge the `hooks` block (step 3) into the project's `.claude/settings.json`
   (do NOT clobber its `permissions`) — note it now has BOTH a `PreToolUse`
   and a `PostToolUse` entry.
6. Install/replace `.husky/pre-commit` (step 4) — `chmod +x`. Keep the review-gate
   and diff-size blocks; keep only the mechanical gates whose npm scripts the
   project actually has.
7. Wire husky: `git config core.hooksPath .husky` (or `npx husky init`).
8. Add `.claude/.review-pass` to `.gitignore`.
9. Add the two CLAUDE.md sections (step 5).
10. (Optional) Add `scripts/check-dead-components.mjs` (step 6) with an EMPTY allowlist,
   and a `"lint:dead-components": "node scripts/check-dead-components.mjs"` npm script.
11. (Recommended) Install `gitleaks` (`brew install gitleaks`) and add a
   `.gitleaks.toml` allowlist file (empty by default) — the pre-commit hook's
   secret-scan step runs automatically if it finds the binary, and warns
   loudly if it doesn't.
12. Restart Claude Code so the `code-reviewer` agent is discoverable.

Requires `jq` and `shasum` on PATH (both standard on macOS).

---

## 1. `.claude/agents/code-reviewer.md`  (portable, verbatim)

```markdown
---
name: code-reviewer
description: Mandatory code review before any commit. Use proactively immediately after writing or modifying code, and always before staging or committing.
tools: Read, Grep, Glob, Bash, Edit, Write
model: claude-opus-4-8
memory: project
color: red
---

You are the sole reviewer of record for this repository. Nothing gets committed
without passing through you.

Process:
1. Run `git diff --cached` (and `git diff` for unstaged work).
2. Review every changed hunk against the checklist below.
3. Fix Critical and Warning issues directly with Edit. Do not hand them back.
4. Re-read what you changed and confirm the fix is correct.
5. Only when zero Critical issues remain, run:
   git diff --cached | shasum -a 256 | cut -d' ' -f1 > .claude/.review-pass

Checklist: correctness, error handling, input validation, exposed secrets or
keys, injection surfaces, N+1 queries, race conditions, dead code, test coverage
for changed paths.

Report as: Critical (fixed) / Warnings (fixed) / Suggestions (left alone).
Never write the .review-pass file if any Critical issue is unresolved.

Record recurring issue patterns in your agent memory so later reviews are faster.
```

---

## 2. `scripts/require-review.sh`  (portable, verbatim — chmod +x)

```bash
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
```

---

## 2b. `scripts/check-diff-size.sh`  (portable, verbatim — chmod +x)

```bash
#!/bin/bash
# Enforces QUALITY_STANDARD.md §5's review-size band: 200-400 changed lines
# gets 70-90% defect detection in review; above ~1,000 lines it falls to
# ~28% (SmartBear/Cisco study). This was previously documented only — this
# script is what makes it real.
#
# Local pre-commit: WARNS only (doesn't block a solo commit — splitting a
# diff after the fact is disruptive and this is a judgment call, not a
# security boundary). CI: pass --enforce to hard-block merges above the
# 1,000-line cliff, where the data is unambiguous.
#
# Usage:
#   scripts/check-diff-size.sh              # warn only, exit 0 always
#   scripts/check-diff-size.sh --enforce     # exit 1 above the hard cutoff
set -euo pipefail
ENFORCE=false
[ "${1:-}" = "--enforce" ] && ENFORCE=true

WARN_LINES=400
HARD_LINES=1000

CHANGED=$(git diff --cached --numstat 2>/dev/null | awk '{add+=$1; del+=$2} END{print add+del+0}')
[ -z "$CHANGED" ] && CHANGED=0

if [ "$CHANGED" -gt "$HARD_LINES" ]; then
  echo "❌ Diff is $CHANGED lines — over the $HARD_LINES-line cliff where review" >&2
  echo "   detection drops to ~28% (SmartBear/Cisco data, QUALITY_STANDARD.md §5)." >&2
  echo "   Split this into smaller, independently reviewable changes." >&2
  [ "$ENFORCE" = true ] && exit 1
  echo "   (local pre-commit: warning only — CI will hard-block this)" >&2
elif [ "$CHANGED" -gt "$WARN_LINES" ]; then
  echo "⚠️  Diff is $CHANGED lines — above the 200-400 line band where review" >&2
  echo "   detection is highest (70-90%, QUALITY_STANDARD.md §5). Consider splitting." >&2
else
  echo "✅ Diff size: $CHANGED lines (within the 200-400 line high-detection band, or smaller)."
fi
exit 0
```

**Why this warns locally but only hard-blocks in CI:** review-size is a
statistical detection-rate argument, not a correctness invariant like "tests
pass" — a single large-but-mechanical change (a rename across 50 files,
a generated-file update) can legitimately exceed the band without actually
being harder to review. Treat the local warning as a prompt to think about
splitting, and reserve the hard `--enforce` block for CI on the true
1,000-line cliff, where the data stops being ambiguous.

---

## 2c. `scripts/lint-and-test.sh`  (PostToolUse — EDIT commands per project)

```bash
#!/bin/bash
# PostToolUse hook: fast self-correction loop after every Edit/Write.
# QUALITY_STANDARD.md §9 Tier 1 calls this out as a DIFFERENT job from
# require-review.sh (PreToolUse, blocks git commit): this runs immediately
# after a file changes and feeds failures back to the agent as a blocking
# message it must address — a tight loop, not a merge gate.
#
# IMPORTANT: this does NOT undo the edit — the violation existed on disk
# momentarily. It's a fast feedback loop, not a hard boundary. The hard
# boundary is still require-review.sh + the git pre-commit hook.
#
# EDIT THE COMMANDS BELOW for this project's actual lint/type-check setup.
# Keep it FAST (seconds, not minutes) — this runs after every single edit,
# so a slow check here makes every Edit/Write tool call sluggish. Push
# anything slow (full test suite, E2E) to the pre-commit/CI tiers instead.
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx)
    npx tsc --noEmit "$FILE" 2>&1 | head -30
    npx eslint "$FILE" 2>&1 | head -30
    ;;
  *.js|*.jsx)
    npx eslint "$FILE" 2>&1 | head -30
    ;;
  *.py)
    command -v ruff >/dev/null 2>&1 && ruff check "$FILE"
    ;;
  *) exit 0 ;;
esac
EXIT=$?
[ $EXIT -ne 0 ] && echo "Fix the above before continuing — this file has a lint/type error." >&2
exit $EXIT
```

---

## 3. `.claude/settings.json` — merge this hooks block (BOTH PreToolUse and PostToolUse)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/require-review.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "./scripts/lint-and-test.sh" }
        ]
      }
    ]
  }
}
```

---

## 4. `.husky/pre-commit`  (chmod +x)

```sh
#!/usr/bin/env sh
# .husky/pre-commit — the real enforcement boundary. git runs this on every
# commit regardless of how it was invoked, so unlike the PreToolUse hook it
# cannot be sidestepped by sh -c or aliases.
# Emergency bypass (leaves a trace in reflog): git commit --no-verify
set -e

# ── Code-review gate (PORTABLE) ───────────────────────────────────────────────
MARKER=".claude/.review-pass"
if [ ! -f "$MARKER" ]; then
  echo "❌ No code review on record. Run the code-reviewer subagent before committing." >&2
  exit 1
fi
if [ "$(git diff --cached | shasum -a 256 | cut -d' ' -f1)" != "$(cat "$MARKER")" ]; then
  echo "❌ Staged changes differ from the reviewed set. Re-run the code-reviewer subagent." >&2
  exit 1
fi
echo "✅ Review marker matches staged changes."

# ── Secret-scan gate (PORTABLE) ────────────────────────────────────────────────
# Mechanical, not LLM-judgment — the reviewer's "no exposed secrets" checklist
# item is qualitative and evadable; this catches known credential patterns
# even if the reviewer missed one. Soft-fails (warns, doesn't block) if
# gitleaks isn't installed, so it can't brick a repo that hasn't set it up
# yet — but it's loud about it either way.
if command -v gitleaks >/dev/null 2>&1; then
  if ! gitleaks protect --staged --redact --no-banner; then
    echo "❌ gitleaks found a likely secret in staged changes. Fix it, or for a" >&2
    echo "   confirmed false positive, allowlist it BY FINGERPRINT in .gitleaks.toml" >&2
    echo "   (never allowlist by file — that blinds future real secrets in it)." >&2
    exit 1
  fi
  echo "✅ Secret scan clean."
else
  echo "⚠️  gitleaks not installed — secret-scan gate SKIPPED (install: brew install gitleaks)." >&2
fi

# ── Diff-size gate (PORTABLE) — warns locally, CI hard-blocks (see script) ───
./scripts/check-diff-size.sh

# ── Test enforcement (PORTABLE — auto-detected, not a placeholder) ───────────
# Runs whatever this project's own test entry point is: package.json's
# "test" script (npm/pnpm/yarn, auto-detected via lockfile), pytest, go
# test, or cargo test. A real hard block on failure via set -e above — an
# earlier version of this doc left this as an "ADD your own tests here"
# comment, which meant fresh installs enforced NOTHING test-related unless
# someone remembered to fill it in. E2E/browser suites are deliberately NOT
# run here (see CI_TEMPLATES.md) — same "don't gate every commit on a slow
# check" reasoning as MUTATION_TESTING.md. Detection miss only warns, same
# as the gitleaks gate above; a detected command that FAILS blocks for
# real. Override: .claude/test-command (one line) skips auto-detection.
if [ -f .claude/test-command ]; then
  TEST_CMD=$(cat .claude/test-command)
elif [ -f package.json ] && jq -e '.scripts.test' package.json >/dev/null 2>&1; then
  if [ -f pnpm-lock.yaml ]; then TEST_CMD="pnpm test"
  elif [ -f yarn.lock ]; then TEST_CMD="yarn test"
  else TEST_CMD="npm test"
  fi
elif [ -f pyproject.toml ] || [ -f pytest.ini ] || [ -f setup.cfg ]; then
  TEST_CMD="pytest"
elif [ -f go.mod ]; then
  TEST_CMD="go test ./..."
elif [ -f Cargo.toml ]; then
  TEST_CMD="cargo test"
else
  TEST_CMD=""
fi

if [ -n "$TEST_CMD" ]; then
  echo "🧪 Pre-commit: running tests ($TEST_CMD)..."
  eval "$TEST_CMD"
else
  echo "⚠️  No test command detected — tests are NOT being enforced." >&2
  echo "   Set .claude/test-command with the exact command for this project." >&2
fi

# ── Additional mechanical gates (ADJUST PER PROJECT — stack-specific, NOT
#    auto-wired the way test execution above is) ─────────────────────────────
npx prettier --check "src/**/*.{ts,tsx,json}" --log-level warn
npx tsc --noEmit
npx eslint
npx madge --circular --extensions ts,tsx src/
echo "✅ Pre-commit checks passed."
```

---

## 5. CLAUDE.md sections

```markdown
## Agent Topology — models

- **Main agent: Opus 4.8.** Drives the session (set via `/model`).
- **Dev subagents: Sonnet 5, max 2 concurrent.** When delegating implementation
  work, spawn subagents with `model: sonnet` explicitly — they otherwise inherit
  the main model.
- **Code reviewer: a SEPARATE Opus 4.8 agent** — `.claude/agents/code-reviewer.md`
  (pinned `model: claude-opus-4-8`). It is not one of the two dev subagents.
- **Never set `CLAUDE_CODE_SUBAGENT_MODEL`.** It overrides every subagent's
  frontmatter — including the reviewer's Opus pin. Keep it unset.

## Code review policy

All code changes go through the `code-reviewer` subagent before commit.
Delegate to it after any Edit or Write, before staging.
A PreToolUse hook blocks `git commit` when no matching review is on record —
if you hit that block, run the reviewer rather than working around it.
```

---

## 6. `scripts/check-dead-components.mjs`  (optional — allowlist emptied for reuse)

```javascript
#!/usr/bin/env node
/**
 * Dead-component check.
 *
 * Fails when a React component under src/ is imported by nothing. Next.js route
 * files (page/layout/error/not-found/loading/template) are entry points and are
 * always excluded.
 *
 * A component going unreferenced is normal during a refactor. Leaving it
 * unreferenced *silently* is the hazard. This check makes that state explicit:
 * either delete the file, or add it to ALLOWLIST with a reason.
 *
 * Usage:  node scripts/check-dead-components.mjs
 */

import fs from 'fs';
import path from 'path';

/**
 * Known-dead components deliberately retained. Each entry MUST carry a reason.
 * Start empty in a new project; add entries only as a conscious review decision.
 */
const ALLOWLIST = new Map([
    // ['src/path/To/Component.tsx', 'Reason it is retained despite being unreferenced.'],
]);

/** Next.js route/entry files are reached by the router, not by imports. */
const ENTRY_FILES = new Set([
    'page.tsx',
    'layout.tsx',
    'error.tsx',
    'global-error.tsx',
    'not-found.tsx',
    'loading.tsx',
    'template.tsx',
    'default.tsx',
]);

const ROOTS = ['src'];
const SOURCE_EXT = new Set(['.ts', '.tsx']);

/** Recursively collect files under a directory. */
function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walk(full, out);
        } else if (SOURCE_EXT.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

const allFiles = ROOTS.filter((r) => fs.existsSync(r)).flatMap((r) => walk(r));
const sources = new Map(allFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));

const components = allFiles.filter(
    (f) => f.endsWith('.tsx') && !ENTRY_FILES.has(path.basename(f)),
);

const dead = [];
for (const file of components) {
    const base = path.basename(file, '.tsx');
    const referenced = [...sources.entries()].some(([other, text]) => {
        if (other === file) return false;
        return new RegExp(`from\\s+['"][^'"]*/${base}['"]|from\\s+['"]\\./${base}['"]`).test(text);
    });
    if (!referenced) dead.push(file);
}

const unexpected = dead.filter((f) => !ALLOWLIST.has(f));
const staleAllowlist = [...ALLOWLIST.keys()].filter(
    (f) => fs.existsSync(f) && !dead.includes(f),
);

if (unexpected.length > 0) {
    console.error('\n✖ Dead component(s) found — imported by nothing:\n');
    for (const f of unexpected) console.error(`   ${f}`);
    console.error(
        '\nEither delete the file, or add it to ALLOWLIST in ' +
            'scripts/check-dead-components.mjs with a reason.\n',
    );
    process.exit(1);
}

if (staleAllowlist.length > 0) {
    console.error('\n✖ Allowlist is stale — these are referenced again and should be removed from ALLOWLIST:\n');
    for (const f of staleAllowlist) console.error(`   ${f}`);
    console.error('');
    process.exit(1);
}

console.log(`✓ No unexpected dead components (${ALLOWLIST.size} known-dead allowlisted).`);
```

---

## How it fits together (the two-layer design)

- **Layer 1 — PreToolUse hook (`require-review.sh`):** soft forcing-function. Nudges
  the *main agent* to run the reviewer before `git commit`. Evadable by design
  (sh -c, aliases) — it shapes behaviour, it does not guarantee it.
- **Layer 2 — git `pre-commit` hook (`.husky/pre-commit`):** the real boundary. git
  runs it on every commit regardless of caller. The review marker + mechanical
  gates (types, lint, tests) are genuine — a forged marker can't make tsc/eslint/
  vitest pass. `--no-verify` bypasses it but leaves a reflog trace.

The `.review-pass` marker is a sha256 of the staged diff, written by the reviewer
only when zero Critical issues remain. Any change to staged content invalidates it,
forcing a re-review. It's honest about its limits: the marker is *presence-evidence*
of the qualitative review, not cryptographic proof one happened — CI and the
mechanical gates are the true backstop.
