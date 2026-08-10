
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

This project has no TS/bundler, so tsc/eslint/madge don't apply. What's
actually wired into pre-commit and CI instead:
- `scripts/check-html-js.mjs` — parses every embedded `<script>` block and
  checks for duplicate static ids (the equivalent of tsc/eslint for a
  bundler-free static-HTML project).
- `npx playwright test` — a real E2E suite (`e2e/aircon-control.spec.js`)
  driving the actual page against a mocked controller, including regression
  tests for the two real defects this project has already shipped (zone
  On/Off falling through to raw navigation; a command's own state-refresh
  racing and clobbering a just-typed value).
- `.github/workflows/test.yml` runs both on every push/PR — see
  TESTING_HANDOFF.md's rule that a suite which never runs in CI is decoration.

## Defect discipline (from DEFECT_DISCIPLINE.md)

Ten rules the code-reviewer applies instead of a generic checklist:
1. **Fix the class, not the instance.** When fixing a bug, enumerate (grep) every
   other member of the same bug class before declaring done, and report the
   enumeration. (Real example this project already hit: the zone On/Off
   `stopPropagation()` bug affected every zone, not just the one tested.)
2. **Comments/docs/config are unverified claims.** Probe the running system
   when behavior matters; don't trust a comment that contradicts the code.
3. **Write the concurrency question down.** For any read-then-write on shared
   state, answer "what happens if two arrive at once?" (This project already
   hit exactly this shape: sending a command then immediately re-reading state
   raced the unit's own update and clobbered the just-entered value.)
4. **Measure before optimizing**, and state what did NOT improve.
5. **Separate observed from believed.** "I ran X and saw Y" ≠ "I believe Y."
   Re-run claims yourself; mark unverified findings as unverified.
6. **Fail-before, pass-after — no exceptions.** Write the failing test, see it
   fail, then fix, then see it pass.
7. **Interrogate your own test.** Ask "what else would make this pass?"
8. **Prefer property tests over enumerated tests for invariants.**
9. **A skipped test is a failing test.** If a suite can skip, assert it didn't.
10. **Pin external contracts to reality.** Any URL/endpoint referenced outside
    the code needs a test asserting it resolves.

## Push policy

Commit to local `main` freely, but never `git push` to the remote without the
user explicitly confirming *that specific push, in that turn*. A general
"yes, push things" earlier in the conversation does not count — re-confirm
every time.

A PreToolUse hook blocks `git push` unless `.claude/.push-approved` exists and
contains the current `HEAD` SHA (write it only after the user's explicit
go-ahead: `git rev-parse HEAD > .claude/.push-approved`). A git `pre-push`
hook enforces the same check as the real boundary.

## PR workflow policy

Work happens on feature branches (`agent/<short-slug>`), not direct commits
to `main`. Feature branches push freely, no confirmation needed. Opening a
PR: `scripts/pr-open.sh <base> <title> [body]`.

Before merging: delegate to the `code-reviewer` subagent against the PR's
actual diff (`scripts/pr-diff.sh <pr-number>`), not just the local working
tree. Zero Critical issues → write `.claude/.pr-review-pass-<PR#>` with the
PR's head SHA.

**Clean review does not authorize merging by itself.** Ask the user to
confirm merging *this specific PR* in *this turn*, then write
`.claude/.merge-approved-<PR#>` with the same head SHA. A PreToolUse hook
blocks the merge call unless both markers exist and match; GitHub branch
protection on `main` is the actual server-side boundary.
