# Changelog

## [2.9.0] — 2026-08-24

### Added
- **Three new kits: `CODE_STANDARDS.md`, `STANDARDS_AUDIT.md`,
  `TEST_EFFECTIVENESS_AUDIT.md`.** Sourced from a real, working set of
  standards/audit docs from an external TypeScript/Next.js/Prisma
  project, genericized for this pack the same way every other kit here
  has been:
  - **`CODE_STANDARDS.md`** — a fill-in-the-blanks reference ruleset
    (file structure, naming, code quality, API/data layer, testing,
    docs, git, config, accessibility). Section 0's stack config, which
    was a filled-in real project's actual values, is now an explicit
    `[ EDIT ]` template. Checklist items that named a specific tool as
    their worked example (Prisma/Postgres, Next.js's `.gitignore`
    entries, Vitest+tsc as the pre-commit command) are marked
    `[STACK-SPECIFIC]` with a note on what to retarget. The file-size
    ratchet rule, which cited the source project's actual violator count
    and a specific date, is now a description of the *pattern* (measure
    first, grandfather explicitly, ratchet forward) rather than a
    borrowed number — same fix already applied elsewhere in this pack
    (`DEFECT_DENSITY_KIT.md`'s baseline bootstrap, `TESTING_HANDOFF.md`
    §4's coverage ratchet). The source project's name, its internal API
    doc filename, and its actual list of required environment variable
    *names* were removed — §9.1 now instructs filling in this project's
    real vars rather than presenting another project's list as if it
    were universal.
  - **`STANDARDS_AUDIT.md`** — the read-only conformance-check prompt
    that scores a codebase against `CODE_STANDARDS.md`. Already close to
    portable; fixed its "FILL IN BEFORE RUNNING" example (was a literal
    Next.js entry point) to an explicit `[ EDIT ]`, removed its pairing
    reference to `HEALTH_FIX.md` (not part of this pack — noted that
    findings should feed whatever remediation-tracking this project
    already has instead), and added `⏭️ Skip`-vs-`❌ Fail` guidance for
    `CODE_STANDARDS.md` sections marked inapplicable to a given project.
  - **`TEST_EFFECTIVENESS_AUDIT.md`** — the deepest audit of the three:
    mutation score, tautological tests, flaky-test rate, retrospective
    escaped-defect rate, past the surface question of coverage %. This
    one was already written stack-agnostic (multi-language mutation-tool
    examples, a manual sampling protocol for when no tool exists) —
    the only fixes were removing references to sibling docs
    (`HEALTH_SCAN.md`, `BUG_HUNT.md`) that aren't part of this pack, and
    cross-linking this pack's own kits where they overlap
    (`MUTATION_TESTING.md` for the mutation-score dimension,
    `DEFECT_DENSITY_KIT.md`/`REVIEWER_CANARY.md` for recurring-defect
    follow-up, `INCIDENT_RESPONSE.md` for post-incident runs).
  - All three verified with a project-name/env-var grep before being
    added, same discipline as every other file in this pack — see
    `README.md`'s "no file in this pack references a specific project"
    rule.
  - Wired into `README.md` (three new table rows, plus a "6b." step in
    the recommended install order) and `COMPATIBILITY.md` (three new
    rows in the Playbooks section).

## [2.8.0] — 2026-08-24

### Added
- **New `COMPATIBILITY.md`** — a one-screen index of every kit's stack
  dependency and adaptation status (✅ portable / ⚠️ adapt, with a pointer
  to that kit's own adaptation section / ❌ conditional on a precondition
  like an AWS account), so triaging this pack against a new project no
  longer means opening every kit doc individually. Consolidates the
  scope-honesty work done across [2.7.0]-[2.7.3] (the JS/TS-only tooling
  disclaimers, the AWS-only playbook adaptation sections, the Azure
  Pipelines/existing-pipeline guidance) into a single lookup table. Kept
  deliberately project-agnostic per the pack's own "no file references a
  specific project" rule — it describes what each kit *requires*, never
  which real projects have adopted what; a closing note explains why
  cross-project adoption tracking is intentionally out of scope for this
  file. Wired into `README.md`: a pointer right after the "no
  project-specific references" paragraph, and a new table row.

## [2.7.3] — 2026-08-24

### Added
- **`CI_TEMPLATES.md` now explicitly tells a project with an existing,
  working pipeline not to replace it with one of the three templates.**
  Prompted by feedback from the same external project: its real CI is a
  Flutter-specific Azure Pipeline, and it correctly declined to adopt
  §3's Azure Pipelines template wholesale (that template's Static/Test
  stages are Node/npm-flavored, same one-example-stack limitation already
  called out elsewhere in this pack) — instead hand-adapting its own
  pipeline with an isolated `Governance` stage. That was the right call,
  but nothing in `CI_TEMPLATES.md` said so or explained *which* parts are
  actually portable. New section identifies the governance stages
  (diff-size, secret scan, dependency audit, defect-density,
  mutation-testing schedule) as the reusable part — their `script:`/`run:`
  bodies don't reference Node and drop into an existing pipeline
  unchanged — versus the Node-specific setup/build steps around them,
  which don't transfer and shouldn't be copied.

## [2.7.2] — 2026-08-24

### Fixed
- **Five more scope-honesty gaps found by auditing every remaining file
  in the pack against the same project's confirmed facts** (Dart/Flutter,
  Firebase, App Store Connect, Azure Pipelines CI, no AWS) — same
  "state the scope, don't imply universality" discipline already applied
  to `MUTATION_TESTING.md`/`PROPERTY_TESTING.md`:
  - **`SECRETS_MANAGEMENT.md`** and **`OBSERVABILITY_STANDARD.md`** were
    both titled "portable across projects" while every concrete mechanism
    named was AWS-specific (Secrets Manager/KMS; CloudWatch/X-Ray/SNS)
    with no non-AWS path. Both gained a scope disclaimer up top and an
    "Adapting to another platform" section (Firebase/GCP, Azure, and for
    `OBSERVABILITY_STANDARD.md` specifically, a client-only/mobile-app
    path — Crashlytics-style crash reporting in place of server logs and
    traces, since a mobile app has no backend to instrument).
  - **`DATA_CLASSIFICATION.md`** — narrower fix: only §2's encryption-at-rest
    guidance was AWS-specific (KMS/RDS/DynamoDB/S3); the classification
    framework itself was already generic. Added the Firebase/GCP, Azure,
    and on-device (mobile OS-level) equivalents inline.
  - **`DEFECT_DENSITY_KIT.md`** — verified `cloc` (the recommended,
    primary path) natively supports Dart via `cloc --show-lang`, so the
    main KLOC-counting path was already fine. The fallback path (used
    only when `cloc` isn't installed) hardcoded a file-extension list
    that silently excluded `.dart` and several other languages — added
    `.dart`, `.rs`, `.scala`, `.c`, `.cpp`, `.h`, `.hpp`, plus a comment
    telling the next person to extend the list rather than assume
    coverage.
  - **`REVIEWER_CANARY.md`** — the canary scaffolding script always wrote
    a JS-syntax `canary.js` file regardless of what language the
    `code-reviewer` being tested actually reviews; a canary passing
    proved nothing about a Dart-reviewing configuration's actual
    defect-catching ability. Added a `lang_ext` field to each manifest
    entry (defaults to `js` for the five starting canaries, unchanged),
    parameterized `setup-canary.sh` to write `canary.<lang_ext>`, and
    added an "Adapting to another language" section explaining that the
    five defect *classes* are universal but the snippets and comment
    syntax need rewriting per-language.
- Confirmed (no change needed) that `agent-governance-kit.md`'s
  language-specific hooks and `infra-gate-kit.md`'s default pattern list
  are already correctly documented as per-project customization points
  (explicit "edit this for your stack" checklist items with worked
  examples), not silent gaps of the same kind as the five above.

## [2.7.1] — 2026-08-24

### Added
- **`README.md` now documents the "write your own local gate-verification
  harness" pattern**, prompted by a second round of external feedback: a
  project correctly declined to copy `test-kit-installers.sh` (it hardcodes
  paths back to this kit's own directory and asserts npm-specific
  pre-commit text) and instead wrote its own `scripts/test-governance-gates.sh`
  testing its own installed gates directly, passing 12/12. That was the
  right call, but until now nothing in this pack said so explicitly or
  described the pattern for the next team to follow — `test-kit-installers.sh`
  was presented as the only example of "verify the gates automatically,"
  with no note that it's maintainer-only and a project needs its own,
  smaller equivalent. Same external feedback separately reconfirmed
  `cost-gate-kit.md` was correctly left uninstalled by a project with no
  AWS surface at all (Firebase + App Store Connect + Azure Pipelines CI
  only) — no pack change needed there, the AWS-only scoping is working as
  designed.

## [2.7.0] — 2026-08-24

### Added
- **`CI_TEMPLATES.md` now ships an Azure Pipelines template (§3)**, closing
  a real gap surfaced by external feedback from a project installing this
  pack on Azure DevOps: `pr-workflow-kit.md` already treated Azure DevOps
  as a first-class provider (`detect-provider.sh`, `pr-open.sh`,
  `pr-diff.sh` all branch on it), but `CI_TEMPLATES.md` only had GitHub
  Actions and AWS CodeBuild — no Azure Pipelines YAML existed anywhere in
  the pack. New `azure-pipelines.yml` mirrors the existing five job/stage
  groups (static, test, defect-density, mutation-testing, deploy) with the
  same scheduling grain (weekly + release-tag for mutation testing,
  release-tag-only for deploy/enforced defect-density). Deploy target left
  generic (`# EDIT`) rather than assuming AWS the way the GitHub Actions
  template does — this pack has no evidence every Azure DevOps project
  deploys to AWS. Validated with `yaml.safe_load` before considering it
  done, same rigor as every other YAML artifact in this pack; caught and
  fixed one real bug in the process (a bash single-quote-escaping trick
  `'"'"'` had leaked into the Deploy step's YAML scalar — invalid YAML
  syntax, not a bash string — replaced with YAML's own doubled-single-quote
  escape). The rest of `CI_TEMPLATES.md`'s section numbering shifted by one
  (old §3 "Why GitHub Actions → AWS uses OIDC" is now §4); every in-file
  cross-reference to that section was greped for and updated, not assumed
  correct.

### Fixed
- **`MUTATION_TESTING.md` and `PROPERTY_TESTING.md` now say plainly that
  their shipped tooling (Stryker, fast-check) is JS/TS-only**, and each
  gained an "Adapting to another language" section describing the
  transferable *pattern* (threshold bootstrapped at measured reality,
  release/schedule-grain gating, and for property testing specifically —
  the language-agnostic invariant-discovery method in §2) without naming
  or fabricating a tool for any other language. Prompted by the same
  external feedback: a non-JS/TS project correctly flagged that no Dart
  mutation/property-testing equivalent ships with this kit, and explicitly
  noted "I'm not fabricating one" — this pack now says the same thing
  about itself, up front, instead of leaving a JS-only template to be
  discovered as a dead end.
- **`README.md`'s index table** — the CI Templates row now mentions all
  three platforms; the Mutation Testing and Property Testing rows now
  state their JS/TS scoping explicitly instead of implying universal
  applicability.

## [2.6.0] — 2026-08-23

### Fixed
- **`CI_TEMPLATES.md`'s GitHub Actions workflow had a duplicate `push:` key
  under `on:`** — two separate `push:` mappings (`branches: [main]` and
  `tags: ['v*']`), which is invalid/ambiguous YAML: the second silently
  overwrote the first when parsed. Verified directly with `yaml.safe_load`
  before assuming — the parsed result kept only `tags: ['v*']`, meaning
  **ordinary pushes to `main` would never have triggered this workflow at
  all**, only pushes of a `v*`-matching tag. Fixed by merging both filters
  into one `push:` key with `branches` and `tags` as sibling filters, the
  correct GitHub Actions syntax. Pre-existing bug, unrelated to this
  session's other changes — found while validating the mutation-testing
  merge below, not looked for on its own.
- **`aws-deploy` job's `Deploy` step had invalid YAML** — `run: echo "EDIT:
  cdk deploy..."` is an unquoted plain scalar containing an embedded `: `
  (colon-space), which YAML reserves as a mapping separator. Found by
  bisecting the file line-by-line after `yaml.safe_load` failed on the
  full document. Fixed by wrapping the whole value in explicit single
  quotes. Also pre-existing, unrelated to mutation testing specifically.

### Added
- **Mutation testing is now genuinely wired into CI**, not just described.
  Previously the `mutation-testing` job existed only as an isolated
  snippet inside `MUTATION_TESTING.md` — verified directly (grepped
  `CI_TEMPLATES.md` for "mutation"/"stryker": zero matches) that it was
  never actually part of the real, shipped workflow anyone would copy.
  Merged the job into both `CI_TEMPLATES.md` templates: GitHub Actions
  (weekly `schedule:` trigger + release tags) and AWS CodeBuild buildspec
  (release-tag builds only — buildspec has no native weekly-schedule
  concept, noted honestly rather than silently omitted; a true weekly
  CodeBuild run needs a separate EventBridge rule, same pattern as
  `cost-gate-kit.md`'s reconciliation rule). `MUTATION_TESTING.md` §3
  updated to point at `CI_TEMPLATES.md` instead of duplicating the job,
  removing the drift risk of two copies. Both YAML files re-validated
  end-to-end after the merge — all 5 GitHub Actions jobs present and
  parsing correctly, buildspec confirmed to include the mutation step.

## [2.5.0] — 2026-08-23

### Changed
- **`install-agent-governance-kit.sh` and `agent-governance-kit.md`: test
  enforcement in `.husky/pre-commit` is now real, not a placeholder.**
  Previously, a fresh install wrote `# ── Mechanical gates: ADD your
  project's own here (tsc / eslint / tests) ──` — a comment, not a command.
  Verified by direct inspection this session that no test command was ever
  actually wired in. Now auto-detects and hard-blocks on: package.json's
  `test` script (npm/pnpm/yarn, lockfile-detected), pytest
  (pyproject.toml/pytest.ini/setup.cfg), `go test ./...` (go.mod), or
  `cargo test` (Cargo.toml). Override via `.claude/test-command` (one
  line) to skip auto-detection. Detection miss only warns (same
  can't-brick-a-fresh-install principle as the gitleaks gate); a detected
  command that fails blocks the commit for real, via `set -e`.
  E2E/browser suites remain deliberately excluded from this local hook —
  too slow to gate every commit on, same reasoning as
  `MUTATION_TESTING.md` — and stay enforced at the CI layer
  (`CI_TEMPLATES.md`) instead.

### Fixed
- **A real syntax bug introduced while building the above**, caught
  immediately by `test-kit-installers.sh` on its first run after the
  change: a multi-line `echo` sequence broke the apostrophe-escaping
  quoting pattern (`'"'"'`) it was adapted from, corrupting
  `install-agent-governance-kit.sh` with an unterminated quote that
  cascaded into a syntax error several lines later. Fixed by using
  double-quoted strings (which don't need apostrophe-escaping) for each
  line instead of reusing the single-quote trick across multiple `echo`
  calls. `test-kit-installers.sh` extended with 5 new assertions,
  including an actual `git commit` through the real generated hook with a
  failing then passing `package.json` test script — not just checking
  that expected text is present in the file.

## [2.4.0] — 2026-08-23

### Added
- **`PR_AUDIT_SAMPLING.md`** — every 10th gated PR merge is automatically
  queued (`scripts/track-merge-for-audit.sh`, a non-blocking companion to
  `require-merge-approval.sh`) for a blind, asynchronous re-review on
  **real, already-approved work** — not synthetic canaries. `setup-pr-audit.sh`
  fetches the real diff (reusing `pr-workflow-kit.md`'s `pr-diff.sh`) and
  frames the re-review explicitly to partially mitigate `code-reviewer`'s
  verified `memory: project` setting (confirmed by reading the file, not
  assumed) — instructing the agent not to consult its own recollection of
  having reviewed this PR before. `log-pr-audit-result.sh` and
  `pr-audit-trend-audit.sh` record and report the rate of real reviews that
  missed something, mirroring the canary's shape. Deliberately not a gate —
  same reasoning as the canary. All queue/pop/log logic tested across 8
  scenarios including counter accuracy, marker-gated counting (won't count
  an unapproved merge attempt), oldest-unaudited selection, and cleanup.
  This is the direct answer to "review careful or rubber-stamped" that the
  canary explicitly could not provide — real outcomes, not mechanism tests.

## [2.3.0] — 2026-08-23

### Added
- **`REVIEWER_CANARY.md`** — tests whether `code-reviewer` still catches
  known defect classes, via a manifest of 5 synthetic canaries (one per
  existing `code-reviewer.md` checklist item: injection surfaces,
  correctness/cross-tenant leak, N+1 queries, race conditions, input
  validation). `scripts/setup-canary.sh` (scaffolds the buggy snippet),
  `scripts/log-canary-result.sh` (records pass/fail), and
  `scripts/canary-trend-audit.sh` (rolling pass rate + which classes are
  missing) are fully scriptable and tested; the review step itself is
  agent-driven (delegates to `code-reviewer`), same operating model as the
  rest of the pack. Deliberately **not** wired as a release gate — a single
  synthetic miss is thin evidence; only a declining trend is actionable,
  and that's left to human judgment rather than auto-blocking. Closes the
  "review careful or rubber-stamped" gap identified in the pack's own
  retrospective — partially: it detects reviewer-mechanism drift, it does
  not and cannot prove any specific real review was thorough.

## [2.2.0] — 2026-08-23

### Added
- **`DEFECT_DENSITY_KIT.md` §13 `scripts/require-trend-audit.sh`** — the
  trend-audit (§12) is now a release gate, not just a report. Auto-passes
  frictionlessly when the trend is improving/flat; blocks the release on a
  confirmed regression unless a **written, non-empty override** (a real
  reason, not an "ok" token) is on record for the current
  `density-history.jsonl` state — invalidated automatically the moment a
  new release is recorded. Closes the "nothing forces anyone to read the
  trend-audit output" gap. Requires `density-trend-audit.sh --enforce`
  (also added) as its underlying pass/fail signal.

## [2.1.0] — 2026-08-23

### Added
- **`MUTATION_TESTING.md`** — Stryker config + CI wiring, closing
  `TESTING_HANDOFF.md` §7 gap #2 (assertion-strength measurement, not just
  coverage %).
- **`PROPERTY_TESTING.md`** — fast-check templates for money/auth/concurrency
  invariants, closing §7 gap #3.
- **`DEFECT_DENSITY_KIT.md` §12 `scripts/density-trend-audit.sh`** —
  automates `QUALITY_STANDARD.md` §7's "audit which section isn't being
  followed" trend check, previously a sentence with no mechanism. Requires
  `--record` on the release-gate CI step to build history over time.


All notable changes to the AI Governance Kit pack. Each installer stamps the
version it installed into `.claude/.governance-kit-version` in the target
repo — check that file to see which version a given project is running,
and diff against this file to see what's changed since.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versioning is semantic in spirit (breaking changes to the marker/hook
mechanism bump major, new kits/gates bump minor, doc fixes bump patch) but
this pack doesn't publish releases anywhere — the version number's job is
purely "can a repo tell what it has and whether it's behind."

## [2.0.0] — 2026-08-13

### Added
- **Cost Gate Kit** (`cost-gate-kit.md`) — AWS Budgets + SNS + Lambda
  auto-remediation, EventBridge reconciliation ("re-lock guard"), Cost
  Anomaly Detection, tag-enforcement SCP. New kit, no installer script
  (deploys AWS resources, not repo files) — see `scripts/deploy-cost-gate-kit.sh`
  embedded in the kit doc.
- **CI reference implementations** (`CI_TEMPLATES.md`) — a working GitHub
  Actions workflow and AWS CodeBuild `buildspec.yml`, running lint/type/
  diff-size/secret-scan/dependency-audit/test/defect-density per the specs
  every other kit had previously only *described*. Includes GitHub OIDC →
  AWS role-assumption guidance (no static AWS keys in CI).
- **`SECRETS_MANAGEMENT.md`** — runtime secrets standard (Secrets Manager/
  Parameter Store, least-privilege retrieval, rotation cadence) —
  previously only covered secrets-in-code via gitleaks, not secrets at rest.
- **`OBSERVABILITY_STANDARD.md`** — structured logging, tracing, alerting
  (with runbook-linkage), SLOs/error budgets — the detection layer
  `INCIDENT_RESPONSE.md` had assumed already existed.
- **`DATA_CLASSIFICATION.md`** — production data classification,
  encryption at rest/in transit, PII/PHI scrubbing in logs and error
  trackers, retention/deletion policy. Companion to `TESTING_HANDOFF.md`
  §3's synthetic-test-data policy, which only covered test data.
- **`ADR_TEMPLATE.md`** — lightweight architecture-decision-record practice,
  distinct from `QUALITY_STANDARD.md` §1's behavior specs.
- **IaC plan-review gate** (`infra-gate-kit.md`) — auto-approve/
  non-interactive infra commands now require a second marker
  (`.claude/.infra-plan-reviewed-<hash>`) proving a plan/diff was actually
  reviewed, mirroring the code path's "review the diff before merge"
  requirement. New `.claude/infra-gate.plan-required.patterns` file.
- **AWS account-isolation guidance** (`infra-gate-kit.md` §5) — the
  Well-Architected-recommended control (separate AWS account for prod via
  Organizations) was previously missing; the kit only covered IAM
  scoping within one account.
- **CDK / CloudFormation / SAM patterns** added to `infra-gate-kit.md`'s
  default `.claude/infra-gate.patterns` — the defaults were Terraform-only
  and missed AWS-native IaC tooling entirely.
- **`scripts/check-diff-size.sh`** (`agent-governance-kit.md`) — mechanically
  enforces `QUALITY_STANDARD.md` §5's 200–400 line review-size band (warns
  locally, hard-blocks in CI above 1,000 lines). Previously documented only.
- **`scripts/lint-and-test.sh`** (`agent-governance-kit.md`) — the
  `PostToolUse` fast self-correction loop `QUALITY_STANDARD.md` §9 Tier 1
  prescribes. Previously described in that doc but never shipped as an
  actual script.
- **`test-kit-installers.sh`** — automated regression suite for the
  installer scripts themselves: spins up a scratch repo, runs each
  installer, asserts expected files/gates exist and actually block/unblock
  as documented. Closes the "physician heal thyself" gap — the one real bug
  previously caught in this pack (a `git rev-parse HEAD` stdout-leak in
  `DEFECT_DENSITY_KIT.md`) was found by ad hoc manual testing, not a
  regression suite that'd catch it automatically on the next edit.
- **Version stamping** — every install script now writes
  `.claude/.governance-kit-version` with the kit's version and the specific
  kit(s) installed, so a repo can report what it has.

### Changed
- **`DEFECT_DENSITY_KIT.md`'s `scripts/defect-density.sh`** now takes
  `--source` and defaults the **release gate** to `incident,prod` (field
  defects only), per `QUALITY_STANDARD.md` §7's explicit requirement that
  review/testing/field density be tracked as separate numbers, not blended.
  Previously the script summed all sources into one undifferentiated ratio,
  which understated real field risk behind a pile of expected, healthy
  review catches.
- **`QUALITY_STANDARD.md`** integrated into the rest of the pack: added to
  `README.md`'s index, explicit Tier↔Layer vocabulary mapping added (§9),
  cross-references added pointing at the now-real implementations of what
  §5, §7, and §9 had previously only prescribed.

## [1.0.0] — 2026-06-19

Initial pack: `agent-governance-kit.md`, `push-gate-kit.md`,
`pr-workflow-kit.md`, `infra-gate-kit.md`, `DEFECT_DENSITY_KIT.md`,
`TESTING_HANDOFF.md`, `DEFECT_DISCIPLINE.md`, `INCIDENT_RESPONSE.md`,
`pr-template.md`, `README.md`, plus install scripts for the four gate kits.
