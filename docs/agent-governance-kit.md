# Agent Governance Kit — portable across projects

A drop-in code-review enforcement + model-topology setup for Claude Code projects.
Extracted from the PharmaMed repo. Copy the portable files, adjust the marked bits.

> ⚠️ **Never copy a project's `.claude/settings.json` `permissions` block between repos.**
> It holds machine-specific paths and (in the source repo) a leaked plaintext DB
> password. Copy ONLY the `hooks` block shown in step 3.

---

## Per-project setup checklist

1. Copy `.claude/agents/code-reviewer.md` (step 1) — verbatim; tune `model:` / checklist.
2. Copy `scripts/require-review.sh` (step 2) — `chmod +x scripts/require-review.sh`.
3. Merge the `hooks` block (step 3) into the project's `.claude/settings.json`
   (do NOT clobber its `permissions`).
4. Install/replace `.husky/pre-commit` (step 4) — `chmod +x`. Keep the review-gate
   block; keep only the mechanical gates whose npm scripts the project actually has.
5. Wire husky: `git config core.hooksPath .husky` (or `npx husky init`).
6. Add `.claude/.review-pass` to `.gitignore`.
7. Add the two CLAUDE.md sections (step 5).
8. (Optional) Add `scripts/check-dead-components.mjs` (step 6) with an EMPTY allowlist,
   and a `"lint:dead-components": "node scripts/check-dead-components.mjs"` npm script.
9. (Recommended) Install `gitleaks` (`brew install gitleaks`) and add a
   `.gitleaks.toml` allowlist file (empty by default) — the pre-commit hook's
   secret-scan step runs automatically if it finds the binary, and warns
   loudly if it doesn't.
10. Restart Claude Code so the `code-reviewer` agent is discoverable.

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

## 3. `.claude/settings.json` — merge ONLY this hooks block

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

# ── Mechanical gates (ADJUST PER PROJECT — keep only scripts this repo has) ────
npx prettier --check "src/**/*.{ts,tsx,json}" --log-level warn
npx tsc --noEmit
npx eslint
npx madge --circular --extensions ts,tsx src/
npx vitest run --reporter=dot
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
