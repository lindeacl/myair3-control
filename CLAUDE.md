
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
- `scripts/check-coverage.mjs` — no Vitest/unit layer exists here (nothing
  isolable to unit-test in a single-file, bundler-free app), so this measures
  real V8 execution coverage of index.html's inline script during the E2E
  run instead, via `e2e/fixtures.js`. Floor is 80% (measured 84.8%, minus a
  hair — TESTING_HANDOFF.md's "ratchet, not a target"). Mode buttons, fan
  speed, the native-only raw-output fetch (faking `window.Capacitor` to make
  `isNative()` true), and a network-failure path are all covered now. Still
  untested: zone temp/damper set, zone name editing, and the live-poll
  auto-refresh interval itself. Raise the floor as the suite grows; never
  lower it without saying why.

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

## Infra change policy

`.claude/infra-gate.patterns` is deliberately empty — this project has zero
cloud infrastructure, zero Terraform, zero cloud CLI usage, and zero DB
migrations, so there is nothing destructive to gate today. The hook
(`scripts/require-infra-approval.sh`) is wired in and will start enforcing
the moment a real pattern is added — if this project ever grows a deploy
pipeline, a cloud backend, or a database, add the matching pattern to
`.claude/infra-gate.patterns` before running anything destructive against it.

## Defect density policy

Every Critical/Warning the code-reviewer fixes, and every production
incident, gets logged: `scripts/log-defect.sh --severity ... --class ...
--files ... --source review|incident`. Name the bug's CLASS (see
docs/DEFECT_DISCIPLINE.md Rule 1), not just the instance.

Defect density (`scripts/defect-density.sh`) is reported on every CI run for
visibility — it never blocks a push or PR, only a release (a `git tag v*`,
`gh release create`, or `npm version` command — none of which this project
currently uses, so the release gate is dormant until one does). The
threshold in `.claude/defect-density.config.json` was bootstrapped from this
project's actual history (the two real defects found and fixed earlier in
this project's life — see `.claude/defects.jsonl`), not a guess. It's a
ratchet — lower it as the codebase matures, never raise it without a comment
explaining why.

## Dependency scanning

`npm audit --audit-level=high` runs in CI on every push/PR (TESTING_HANDOFF.md
§5), gated on high/critical findings only. Moderate/low findings are visible
but don't block — see this repo's CI run for anything currently accepted and
why (documented at the point the finding first appeared, not silently ignored).

## Reference docs

`docs/` holds full copies of the playbooks this project's CLAUDE.md summarizes:
`DEFECT_DISCIPLINE.md`, `TESTING_HANDOFF.md`, `INCIDENT_RESPONSE.md`,
`DEFECT_DENSITY_KIT.md`, `infra-gate-kit.md`, `agent-governance-kit.md`,
`pr-workflow-kit.md`, `push-gate-kit.md`, `QUALITY_STANDARD.md`, `README.md`
(the kit's own index). `docs/postmortems/` is where an incident postmortem
goes if one is ever needed (see `INCIDENT_RESPONSE.md`).

`QUALITY_STANDARD.md` is reference-only here, not adopted verbatim — see
"Quality standard adoption notes" below for what applies to this project and
what doesn't.

## Quality standard adoption notes

`docs/QUALITY_STANDARD.md` was written for greenfield, team-scale projects.
Most of it either already has an equivalent here (via the other kits) or
doesn't map cleanly onto a solo-maintained, single-file static-HTML app. What
was actually adopted vs. what can't be, section by section:

- **§1 Spec before code — NOT adopted as a hard gate.** A mandatory written
  spec artifact per task is process weight built for a requirements-review
  team; this project's tasks arrive as live conversational requests to a
  single maintainer. Note what §8 actually says, since it cuts the other
  way: spec-first does *not* retrofit to the existing base retroactively,
  but it "applies to *new* work and to any area being substantially
  modified" — so the standard would have it apply to this project's ongoing
  changes. The reason it isn't adopted here is the reviewer, not the
  history: a spec's value in the research is as an artifact a second party
  reviews before code exists, and there is no second party here. The spirit
  survives informally (every bug fix states its root cause and enumerated
  class in the PR description per Rule 1), but there's no mechanism
  enforcing a spec exists before code is written.
- **§2 Coding standard — mostly N/A, not adopted verbatim.** "Strict typing,
  no untyped escape hatches" doesn't apply — there is no TypeScript here, by
  design (see the top of this file). "No new dependencies without
  justification" is already true trivially (zero runtime dependencies).
  "Every error path logged" doesn't map cleanly to a client-side UI with no
  server-side log sink; this app's equivalent is surfacing errors to the
  visible status line (`describeFetchError()`), which the toggle-button/UX
  work this session already hardened. Not re-implementing this section as a
  formal rule — it would restate things already true or already covered
  elsewhere under different names.
- **§3 Test discipline — already implemented**, via `TESTING_HANDOFF.md`
  (Playwright E2E, coverage-as-a-ratchet). The "testing alone catches ~1/3 of
  defects, pair with review" principle is already how this session's reviews
  work in practice — see §5 below.
- **§4 Deterministic gates — mostly already implemented.** What was missing
  and has now been added: a `PostToolUse` hook (`scripts/check-after-edit.sh`,
  wired in `.claude/settings.json`) that runs the mechanical check
  (`scripts/check-html-js.mjs` — this project's equivalent of tsc/eslint,
  since there's no TS/bundler) immediately after every `Edit`/`Write` to
  `index.html`, not just at commit time. What was **not** added: running the
  full Playwright suite on every single edit — the standard's own example
  bundles "lint/type-check/tests" into one after-every-edit step, but for
  this project that's an 8-14s round-trip per keystroke-scale edit, which
  would make interactive editing painful for no real benefit over the
  existing pre-commit gate (which already runs the full suite before
  anything lands). Full-suite verification stays at the commit gate, matching
  what this project already had; only the fast syntax/duplicate-id check
  moved earlier. The hook targets this repo's `index.html` by resolved
  absolute path, not by filename — a bare `*/index.html` glob would also
  match the sibling `../ios-app/www/index.html` and gate an edit there on
  this repo's checker.
- **§5 Independent review sizing (200–400 changed lines, <60–90 min
  sessions) — cannot be mechanically enforced here, and isn't adopted as a
  hard diff-size gate.** The research behind this section measures *human*
  reviewer attention decay; the actual review mechanism in this project is
  an independent LLM subagent doing exhaustive re-verification (grep
  sweeps, re-running the full test suite, reverting fixes to prove
  fail-before/pass-after) rather than a human skimming a diff, so the
  premise the line-count limit is protecting against doesn't transfer
  directly. There is also no tooling in this stack to reject a commit for
  being "too large." The *spirit* — keep changes reviewable, don't land one
  unreviewed blob — already holds in practice: the whole app is under 1
  KLOC, and every PR this session has been a few hundred lines at most,
  broken into incremental review-then-fix rounds when a review found gaps
  (see PR #8's three-pass history) rather than landed as one big diff.
- **§6 Defect feedback loop — already implemented**, via
  `DEFECT_DISCIPLINE.md` Rule 1 + `scripts/log-defect.sh`.
- **§7 Metrics — already implemented**, via `DEFECT_DENSITY_KIT.md`.
- **§8 Applying to an existing codebase — already the operating model.**
  Both the coverage floor and the defect-density threshold were bootstrapped
  from measured reality, not asserted targets, exactly as this section
  prescribes.
- **§9 Tiers — Tier 0 (advisory) deliberately NOT done via `@`-import.**
  This project's existing convention is prose-summarizing each kit in
  `CLAUDE.md` with a full copy in `docs/` for reference, not auto-loading
  every playbook's full text into every session's context via `@file`
  imports — adding five more `@`-imported files would meaningfully bloat
  every session's starting context for marginal benefit over the existing
  summaries. Tier 1 is now implemented for the fast check (see §4 above);
  the full-suite half is deliberately still commit-gated only, for the
  latency reason given above. Tier 2 (CI + branch protection) was already in
  place before this update. §9's closing rule — "deliberately introduce a
  rule violation and confirm each tier catches it" — **is** adopted, and is
  the one part of this standard this project was missing rather than
  outgrowing: `scripts/test-check-after-edit.sh` feeds the hook a known-bad
  and a known-good `index.html` plus the malformed/foreign-path cases and
  asserts exit 2 / exit 0. It runs in CI, so the gate can't be silently
  disabled by a later edit to its matching logic. Verifying a gate once by
  hand in a session is a *believed* result for everyone after (Rule 5); this
  makes it an observed one on every push.
