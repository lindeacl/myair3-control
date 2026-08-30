# Contributing

This is a solo-maintained personal project (see
`docs/CODE_STANDARDS.md` Section 0 — one developer, no team to
coordinate), so this file stays short: it documents the actual convention
in use, not a process built for a team that doesn't exist here.

## Workflow

- Work happens on short-lived feature branches (`agent/<short-slug>`), not
  direct commits to `main` — `main` is branch-protected on GitHub.
- Commit locally as often as you like on your branch.
- **Pushing to the remote requires explicit, per-push confirmation** — see
  `CLAUDE.md`'s "Push policy". A prior "yes, push things" doesn't carry
  forward to a later push; each one is confirmed on its own.
- Landing a change on `main` goes through a pull request (`scripts/pr-open.sh
  <base> <title> [body]`), not a direct push to `main` (branch protection
  blocks that anyway).

## Review gate

Every PR is reviewed by the `code-reviewer` subagent (a separate model
instance, briefed adversarially — "find defects, don't fix them") against
the PR's actual diff before it merges, not just the local working tree.
A clean review with zero Critical issues is required before merge, but
**does not by itself authorize merging** — merging still needs the user's
explicit, per-PR confirmation. See `CLAUDE.md`'s "PR workflow policy" for
the exact marker-file mechanics (`.claude/.pr-review-pass-<PR#>`,
`.claude/.merge-approved-<PR#>`) that enforce this.

Locally, `.husky/pre-commit` runs the mechanical gates on every commit:
the code-review marker check, a secret scan (gitleaks), a diff-size
warning, `scripts/check-html-js.mjs` (this project's lint-equivalent —
parses `index.html`'s inline scripts, checks for duplicate ids), the full
Playwright suite, and the coverage floor. CI (`.github/workflows/test.yml`)
re-runs the same gates server-side, plus a hard diff-size block and a
gitleaks backstop that can't be skipped with `--no-verify`.

## Code standards

The full ruleset — file/naming conventions, function-size guidelines,
error-handling expectations, accessibility checks, etc. — lives in
`docs/CODE_STANDARDS.md`. It's filled in for this project's actual stack
(vanilla JS/HTML, no bundler, Playwright-only testing), not left as a
generic template.
