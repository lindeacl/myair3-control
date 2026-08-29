# Quality Standard — Commercial/Enterprise Grade
**Target: converge toward 1–3 confirmed defects per 1,000 lines of code (KLOC), measured post-release.**

## What this document is (and isn't)
This is a process standard, not a guarantee. Defect density is a measured outcome — it's counted after code exists and has been tested/used, not something a rule set produces directly. What follows is grounded in published defect-origin and code-review research (sources at the bottom); following it is what the evidence says reduces defect rates. Whether it's working still has to be checked against the metrics in Section 7 — don't assume conformance.

Applies to: **new projects from initiation.** For applying this to an existing codebase, see Section 8 — several sections below do not retrofit as-is.

---

## 1. Spec before code
**Why:** Defects originate disproportionately upstream — in requirements and design, not in the coding step itself. A defect caught during requirements review costs roughly an order of magnitude less to fix than the same defect caught during system testing (Hughes Aircraft data, cited via McConnell). Every hour spent on upstream technical review saves an estimated 3–10 hours of downstream defect repair (Capers Jones).

**Rule for the agent:**
- No implementation task begins without a short written spec: inputs, outputs, edge cases, error states, explicit non-goals.
- Ambiguity in the spec is resolved — asked, or flagged in writing as an assumption — before code is written. Never silently assumed.
- The spec is what tests are written against, not the implementation.

## 2. Coding standard (baseline — adapt to your stack)
- No silent error handling. Every caught exception/error is logged or explicitly re-raised with rationale. No empty catch blocks.
- Strict typing where the language supports it. No untyped escape hatches (`any`, unchecked casts) without an inline justification comment.
- No dead or unreachable code. If it doesn't trace to a requirement, it doesn't ship.
- New dependencies require justification. No new package for something trivial to hand-write.
- Every error path and key state transition is logged. No swallowed failures.

## 3. Test discipline
- Every behavior in the spec has at least one test before the task is considered done.
- Tests must assert real outcomes, not just execute code. A test that runs a function and asserts nothing meaningful is worse than no test — it inflates coverage numbers while adding no defect-detection value. Coverage-percentage gaming is a well-documented failure mode of AI-generated test suites; watch for it specifically.
- Testing alone is not sufficient. A single testing round historically catches roughly a third of the defects present in the code under test (Capers Jones data — note his lowest efficacy figures are for unit testing measured before modern CI-integrated automated suites were standard, so treat that specific number as a floor, not current best practice). Testing has to be paired with review (Section 5), not substituted for it.

## 4. Deterministic gates — enforced, not advisory
Rules written in a standards file are advisory. An agent (or a human, under deadline pressure) can and will drift from them over a long session. Every rule above needs something that mechanically blocks a bad change, not just a reminder:
- Lint + type-check run after every file edit; any error blocks the change — not a warning.
- Tests must pass and coverage must not regress below the agreed floor before merge.
- Static analysis at strict settings, zero-warning policy, as a CI gate.

*(Claude Code implementation: see Section 9 for the specific hook mechanics — a `PostToolUse` hook and a `PreToolUse` hook do different jobs here and neither alone is sufficient.)*

## 5. Independent review — mandatory, sized correctly
**The highest-leverage, most commonly skipped step in agent-built code: the agent that wrote the code cannot be the sole approver of it.** Formal design/code review is consistently found to catch defects more efficiently than testing alone, and at lower cost per defect found.

Review sizing, grounded in the SmartBear/Cisco study (2,500 reviews, 3.2M lines, 50 developers):
- Keep each review to roughly **200–400 changed lines**. Detection rate in that range runs 70–90%; it falls sharply above ~1,000 lines (reported as low as ~28% in follow-up analysis of the same dataset).
- Keep review sessions under **60–90 minutes** — detection quality drops off past that regardless of size.
- Keep inspection pace under **~400–500 LOC/hour** — faster than that and defect density found drops sharply.
- If a task would produce a larger diff, split it. Don't land it as one large change and call it done.

**Rule for the agent:** after implementation, hand off to a separate agent context (or a human) briefed adversarially — "find defects in this, don't fix them" — before merge. Self-review by the same context that wrote the code does not count as review.

**Enforced, not just documented:** `agent-governance-kit.md` ships `scripts/check-diff-size.sh`, wired into the pre-commit hook — it warns at 400 changed lines and hard-blocks (in CI; warns locally) above 1,000. See that kit for the script.

## 6. Defect feedback loop
Every defect found in review or testing gets root-caused, not just patched. If the same class of defect could recur, the fix is: add a rule to this file (or the lint/static-analysis config) that would catch it mechanically next time — not just fix the one instance. This is what moves the trend line down over successive releases, not the individual fixes.

## 7. Metrics — what "1–3 defects/KLOC" actually means
The number is meaningless without agreed counting rules, defined before work starts:
- **What counts as a defect** — a confirmed bug verified against the spec, not every review comment.
- **What counts as KLOC** — source lines only (`cloc`-style), excluding blank/comment/generated/vendor code.
- **Measurement cadence** — per release, or rolling.

Track from day one:
- Defects found in review ÷ KLOC reviewed
- Defects found in testing ÷ KLOC
- Defects found post-release (field) ÷ KLOC — the number that actually validates the process; the others are leading indicators
- Review size distribution over time — are diffs staying in the 200–400 line band, or drifting up

**Implemented, not just prescribed:** `DEFECT_DENSITY_KIT.md`'s `scripts/defect-density.sh` takes `--source review|incident,prod|review,incident,prod` and defaults the **release gate specifically** to `incident,prod` (field defects) — the blended/review numbers are available for dashboards via an explicit `--source` flag but are never the release-gate threshold. See that kit's "Source segmentation" section.

If field defect density isn't trending toward the target after a few release cycles, the fix isn't "try harder" — audit which of Sections 1–6 is actually being followed versus just documented.

**Implemented, not just prescribed:** `DEFECT_DENSITY_KIT.md` §12's
`scripts/density-trend-audit.sh` automates exactly this check — it compares
the last N release-density snapshots and, if the trend isn't improving,
prints this section's audit prompt (per §1–6) directly rather than leaving
it as a sentence someone has to remember to act on.

## 8. Applying this to an existing codebase
Sections 4, 5, and 6 (gates, review sizing, feedback loop) apply as-is starting today — they're process changes, not dependent on the code's history.

Sections 1 and 7 do not retrofit directly:
- You can't write a spec "before" code that already exists — writing one to match current behavior isn't the same lever. For legacy code, spec-first applies to *new* work and to any area being substantially modified, not the whole existing base retroactively.
- You cannot claim a defect-density target without first measuring current defect density. There is no day-zero for a codebase that already has history.

**Practical pattern: a ratchet, not a rewrite.**
1. Baseline first — run static analysis and pull existing defect history to get an actual current defect-density number, not an assumed one.
2. Apply full gates (Sections 1–6) to new and changed code only. Existing untouched code is exempt until it's touched.
3. When a file is modified, it must pass the new standard before the change merges — the bar ratchets up file-by-file as the codebase is worked, rather than requiring a big-bang rewrite.
4. Track the trend line (Section 7) against the baseline, not against zero.

## 9. Applying and enforcing this file
**A markdown file, on its own, is not enforced — it's context.** Expecting a standards document to behave like configuration is a common and documented failure mode. Getting real enforcement requires three distinct tiers; each closes a gap the previous one leaves open. Skipping straight to Tier 0 is the most common mistake and provides no actual guarantee.

> **Vocabulary note:** the rest of the AI Governance Kit pack (`agent-governance-kit.md`, `push-gate-kit.md`, `pr-workflow-kit.md`, `infra-gate-kit.md`) calls these same three enforcement levels "**Layer 1 / 2 / 3**" instead of "Tier 0 / 1 / 2." They're the identical split — Tier 0 = advisory context, Tier 1 = session-level PreToolUse/PostToolUse hooks (Layer 1 in the other kits), Tier 2 = the git-hook-and-server-side backstop (Layer 2, and Layer 3 where a remote API is involved, e.g. branch protection). Read "Tier" and "Layer" as synonyms across this pack — the numbering starts at a different offset (0 vs 1) because this file counts the advisory-context step as its own tier and the other kits treat it as pre-enforcement scaffolding, not a tier at all.

**Tier 0 — Advisory (context only, no guarantee):**
Reference this file from the project's `CLAUDE.md` with `@QUALITY_STANDARD.md`. It auto-loads at session start and survives `/compact`. This shapes the agent's behavior but does not guarantee compliance — treat it as necessary, not sufficient.

**Tier 1 — Session-level gates (real, but only active within a configured session):**
Two hooks do different jobs and both are needed:
- `PostToolUse` on `Edit|Write`: run lint/type-check/tests after every file change. On failure, exit code 2 sends the error back to Claude as a blocking message it must address. **This does not undo the edit** — the violation existed on disk momentarily — it's a fast self-correction loop, not a hard block.
- `PreToolUse` on `Bash` matched against `git commit` / `git push`: run the full gate (lint + tests + coverage threshold) *before* the commit/push executes, and exit code 2 blocks the action outright. This is the actual hard block — nothing lands without passing.

**This is not just an illustrative sketch — it ships.** `agent-governance-kit.md` provides both scripts verbatim: `scripts/lint-and-test.sh` (the `PostToolUse` fast self-correction loop described above) and `scripts/require-review.sh` + the git `pre-commit` hook (the `PreToolUse`/hard-block pair). Install `agent-governance-kit.md` to get this tier for real rather than hand-rolling it from the sketch below.

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "./scripts/lint-and-test.sh" }]
    }],
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "./scripts/require-review.sh" }]
    }]
  }
}
```
`scripts/require-review.sh` inspects stdin for the actual command being run, only acts when it matches `git commit`, checks the review marker, and exits 2 with a clear reason on failure — see `agent-governance-kit.md` for the full, verbatim implementation (including the diff-size check from §5 below, wired into the same pre-commit hook).

**Critical operational detail:** commit hook config to **project-level** `.claude/settings.json`, not personal `~/.claude/settings.json`. Project-level hooks apply to everyone working in the repo; personal ones apply only to whoever set them up locally. If the goal is team-wide enforcement, the hooks must live in the repo.

**Tier 2 — Backstop (authorship-agnostic, the only tier that's actually required):**
CI checks (lint, tests, coverage floor, static analysis) plus branch protection requiring them to pass before merge. This is the tier that matters most, because it's the only one that doesn't depend on whether hooks were configured for a given session, whether the change came from an agent or a human, or whether someone bypassed local settings. Tiers 0–1 reduce how often CI catches something; Tier 2 is what actually guarantees nothing non-compliant reaches the main branch.

**Verifying it's actually working — don't assume, test it:**
- Deliberately introduce a rule violation (e.g., an untyped escape hatch, a >400-line diff) and confirm each tier catches it as expected.
- Confirm hook config is committed to the repo, not sitting only in someone's local settings.
- Periodically check that CI is actually blocking merges on failure, not just reporting status.

---

## Sources
- SmartBear / Cisco code review study (2,500 reviews, 3.2M LOC): https://static1.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf
- Capers Jones, defect origins & removal efficiency (*Applied Software Measurement*, McGraw-Hill): summarized at https://insights.cermacademy.com/6-software-defect-origins-and-removal-methods-c-capers-jones-technologyrisk/
- Steve McConnell, "An Ounce of Prevention" (upstream defect cost data, citing Jones and Hughes Aircraft): https://stevemcconnell.com/articles/an-ounce-of-prevention/
- Defect density benchmark ranges by industry tier: cross-referenced across Kiuwan, BrowserStack, PNSQC (Boris Beizer), Tricentis — no single primary standard exists for this; treat as converging industry consensus rather than one authoritative figure.
