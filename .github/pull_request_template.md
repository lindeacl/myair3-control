## Summary

<What changed and why, in 1-3 sentences.>

## Defect discipline (DEFECT_DISCIPLINE.md)

- [ ] **Class, not instance** — I enumerated every member of the bug's class
      (grep/AST) and the enumeration is in this PR description, if this PR
      fixes a bug.
- [ ] **Probed, not assumed** — behaviour claims here are verified against the
      running system, not against comments/docs/config.
- [ ] **Concurrency** — for any read-then-write on money/shared state, I wrote
      down the "two at once" answer and used a DB constraint / atomic update.
- [ ] **Measured** — perf changes include before/after numbers and state what
      did NOT improve. (N/A if no perf change.)
- [ ] **Observed vs believed** — I re-ran anything I'm claiming; relayed claims
      are marked as unverified.
- [ ] **Fail-before/pass-after** — failing test shown before the fix, passing
      after. (If not possible, explained why.)
- [ ] **Interrogated the test** — I confirmed it fails when the bug is present.
- [ ] **No silent skips** — no test in this change can skip to green unnoticed.
- [ ] **External contracts pinned** — new URLs/env/flags have a test that they
      resolve.

## Testing (TESTING_HANDOFF.md)

- [ ] Appropriate layer chosen per the layer model (§1) — not everything
      pushed to E2E, not business logic left untested at the unit layer.
- [ ] Coverage thresholds unchanged, or changed with a comment explaining why
      (never silently lowered).
- [ ] New/changed external URLs, env vars, or feature flags have a resolving
      test (§5).

## Defect logging (DEFECT_DENSITY_KIT.md)

- [ ] If this PR fixes a Critical/Warning caught by code-reviewer, it was
      logged: `scripts/log-defect.sh --severity ... --class ... --source review`
- [ ] N/A — this PR doesn't fix a defect.

## Dependencies (if this PR adds/updates a package)

- [ ] `npm audit` / `pip-audit` / equivalent run clean, or findings are
      accepted with a stated reason.
- [ ] No new dependency introduced without a one-line reason it's needed.

## Data handling (if this PR touches test fixtures or seed data)

- [ ] Test/seed data is synthetic — no real user/patient/customer data,
      even anonymized.

## Merge readiness (pr-workflow-kit.md, if installed)

- [ ] Reviewed against the PR's actual diff (`scripts/pr-diff.sh <PR#>`), not
      just the local working tree.
- [ ] Merge confirmation is separate from review approval — a clean review
      does not authorize merging by itself.
