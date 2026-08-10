
## Agent Topology — models

- **Code reviewer: a SEPARATE Opus agent** — `.claude/agents/code-reviewer.md`
  (pinned `model: claude-opus-4-8`).
- **Never set `CLAUDE_CODE_SUBAGENT_MODEL`.** It overrides every subagent's
  frontmatter — including the reviewer's Opus pin. Keep it unset.

## Code review policy

All code changes go through the `code-reviewer` subagent before commit.
Delegate to it after any Edit or Write, before staging.
A PreToolUse hook blocks `git commit` when no matching review is on record —
if you hit that block, run the reviewer rather than working around it.

This project has no CI, no test runner, and no `package.json`-based lint/type
checks (it's static HTML/JS + a Capacitor iOS shell). The pre-commit hook only
enforces the review-marker check — no mechanical gates (tsc/eslint/vitest) are
wired in, since none exist here. Push and merge are NOT gated — this is a
solo, direct-to-main workflow; only the pre-commit review check applies.
