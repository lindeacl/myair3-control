# AI Governance Kit — index

**v2.9.0** — see `CHANGELOG.md` for what changed. Every installer stamps
`.claude/.governance-kit-version` in the target repo, so an installed
project can always report which version of this pack it's running.

A portable set of drop-in gates and playbooks for running Claude Code (or any
similarly-agentic tool) against a real codebase with real consequences. Every
kit is designed to be copied into a brand-new project with minimal
adaptation — the marker-file mechanism and two/three-layer design repeats
across all of them on purpose, so learning one teaches you the rest.

**This pack is universal — not tied to any specific project.** It's meant
to be the starting position for new software AND retrofittable onto
software already built:

- **New projects:** install everything from day one; the defect-density
  and coverage thresholds bootstrap themselves at whatever the codebase
  measures on day one (0, typically) and ratchet from there.
- **Existing codebases:** every installer is idempotent and non-destructive
  by design — `.claude/infra-gate.patterns`, an existing `.husky/pre-commit`,
  an existing `.claude/settings.json`'s `permissions` block, etc. are
  detected and **preserved, never overwritten**; the kits merge in
  alongside what's already there. For the density/coverage-style gates
  specifically, `DEFECT_DENSITY_KIT.md`'s baseline bootstrap and
  `TESTING_HANDOFF.md` §4's coverage ratchet both start at **measured
  reality** for the existing code, not zero — see `QUALITY_STANDARD.md` §8
  for the full "ratchet, not a rewrite" pattern this whole pack follows
  when applied to a codebase that already has history.

No file in this pack references a specific project, company, or codebase —
verified by grep across the whole folder. If you ever find one, it's a bug;
file it the same way you'd file any other defect this pack governs.

**Triaging this pack against a new project? Start with `COMPATIBILITY.md`**
before reading every kit doc individually — it's a one-screen index of
which kits are fully generic, which need adapting (and where that
guidance lives), and which are conditional on something like an AWS
account existing. Each kit's own doc remains the source of truth if the
two ever disagree.

**Run `bash test-kit-installers.sh` before trusting any of this** (or after
editing any kit) — it spins up a scratch repo, installs everything, and
asserts every gate actually blocks and unblocks as documented. This is the
pack's own regression suite, applying `DEFECT_DISCIPLINE.md` Rule 6 to
itself rather than just to the code it governs.

**`test-kit-installers.sh` is maintainer-only tooling for this pack, not
something to copy into a target project** — it hardcodes paths back to
this kit's own directory and asserts on this pack's specific installers
(and, incidentally, npm-specific pre-commit text). Once a project has
actually installed the gates it wants, write a small local script that
tests *that project's own* gate scripts directly — same intent
(`DEFECT_DISCIPLINE.md` Rule 6 applied to the gates themselves: automated
verification instead of ad hoc manual testing) with a project-scoped
implementation instead of maintainer tooling. A project without npm, or
without every kit installed, should still end up with something like
`scripts/test-governance-gates.sh` — asserting each *installed* gate
actually blocks and unblocks — rather than skipping verification because
this pack's own harness doesn't fit.

---

## What's in the pack

| Kit | Gates | Install |
|---|---|---|
| **Agent Governance Kit** | `git commit` — mandatory independent code review, diff-size check, **auto-detected test enforcement (real hard block, not a placeholder)**, PostToolUse fast-feedback lint | `install-agent-governance-kit.sh` |
| **Push Gate Kit** | `git push` — fresh per-push human confirmation | `install-push-gate-kit.sh` |
| **PR Workflow Kit** | PR merge — review + separate merge confirmation | `install-pr-workflow-kit.sh` |
| **Infra Gate Kit** | destructive infra commands (`terraform`/`cdk`/`cloudformation`/`sam`, cloud deletes, prod migrations...) + plan-review sub-gate | `install-infra-gate-kit.sh` |
| **Cost Gate Kit** | AWS spend — Budgets + SNS + Lambda auto-remediation, Cost Anomaly Detection, tag-enforcement SCP | `cost-gate-kit.md` → `scripts/deploy-cost-gate-kit.sh` (deploys AWS resources, not repo files) |
| **Defect Density Kit** | releases — ratcheted KLOC-based quality gate, **field-defects-only by default**, plus a trend-audit gate (blocks release on regression unless a written override is on record) | (see `DEFECT_DENSITY_KIT.md`, no single installer — several moving pieces, install by hand) |
| **Mutation Testing** | weekly + release-tag CI job (in `CI_TEMPLATES.md`) — measures assertion strength, catches "green but worthless" tests. **JS/TS only** (Stryker) — see `MUTATION_TESTING.md` "Adapting to another language" if this project isn't JS/TS | copy `stryker.conf.json`/`package.json` script from `MUTATION_TESTING.md`; CI wiring already in `CI_TEMPLATES.md` |
| **Property Testing** | (playbook + templates) — invariant testing for money/auth/concurrency edges enumerated tests miss. **Template is JS/TS only** (fast-check); discovery method (§2) is language-agnostic — see `PROPERTY_TESTING.md` "Adapting to another language" | copy templates from `PROPERTY_TESTING.md` |
| **Reviewer Canary** | (informational, not a gate) — periodically tests whether `code-reviewer` still catches known defect classes; flags a declining pass-rate trend | copy scripts + manifest from `REVIEWER_CANARY.md` |
| **PR Audit Sampling** | (informational, not a gate) — every 10th gated merge gets a blind, asynchronous re-review on REAL work, not synthetic; flags a rising "original review missed something" rate | copy scripts from `PR_AUDIT_SAMPLING.md` (requires PR Workflow Kit) |
| **Quality Standard** | (research-grounded rationale, not a gate itself) — spec discipline, review sizing, the Tier 0/1/2 enforcement model | reference from `CLAUDE.md` with `@QUALITY_STANDARD.md`; its Tier 1/2 mechanisms are the scripts the gate kits above actually ship |
| **Compatibility Matrix** | (reference index, not a gate) — one-screen per-kit lookup: fully generic vs. needs adapting (and where) vs. conditional on a precondition like an AWS account | read `COMPATIBILITY.md` before installing anything, to triage which kits apply here |
| **CI Templates** | GitHub Actions workflow, AWS CodeBuild buildspec, or Azure Pipelines YAML (pick the one matching this project's actual CI platform) running every gate above, plus OIDC-based AWS auth | copy from `CI_TEMPLATES.md` |
| **Testing Handoff** | (playbook, not a gate) — layer model, coverage ratchet, CI design | copy `TESTING_HANDOFF.md` into `docs/` |
| **Code Standards** | (fill-in-the-blanks ruleset, not a gate) — file structure, naming, code quality, API/data-layer, testing, docs, git, config, and (frontend) accessibility rules | copy `CODE_STANDARDS.md` into `docs/`, fill in Section 0 with this project's real stack |
| **Standards Audit** | (agentic audit prompt, not a gate) — read-only conformance check of a codebase against `CODE_STANDARDS.md`, scored per section | run `STANDARDS_AUDIT.md` as a prompt against a filled-in `CODE_STANDARDS.md` |
| **Test Effectiveness Audit** | (agentic audit prompt, not a gate) — goes past coverage % to ask whether the test suite actually catches bugs: mutation score, tautological tests, flaky-test rate, retrospective escaped-defect rate | run `TEST_EFFECTIVENESS_AUDIT.md` as a prompt; pairs with `MUTATION_TESTING.md` and `DEFECT_DENSITY_KIT.md` |
| **Defect Discipline** | (playbook, not a gate) — 10 rules, PR checklist | copy `DEFECT_DISCIPLINE.md` into `docs/` or `CONTRIBUTING.md` |
| **Incident Response** | (playbook, not a gate) — rollback + postmortem, feeds Defect Density | copy `INCIDENT_RESPONSE.md` into `docs/` |
| **Secrets Management** | (playbook, not a gate) — runtime secrets, rotation, least-privilege retrieval | copy `SECRETS_MANAGEMENT.md` into `docs/` |
| **Observability Standard** | (playbook, not a gate) — structured logs, tracing, alerting, SLOs | copy `OBSERVABILITY_STANDARD.md` into `docs/` |
| **Data Classification** | (playbook, not a gate) — production data sensitivity, encryption, PII/PHI scrubbing | copy `DATA_CLASSIFICATION.md` into `docs/` |
| **ADR Template** | (lightweight practice, not a gate) — architecture decision records | copy `ADR_TEMPLATE.md`, create `docs/adr/` |
| **PR Template** | (shared artifact) — the one checklist all the above reference | `cp pr-template.md .github/pull_request_template.md` |

---

## Recommended install order for a new project

```bash
cd <target-repo>

# 1. Code review gate — the foundation everything else assumes exists
bash "AI Governance Kit/install-agent-governance-kit.sh"

# 2. Push approval gate
bash "AI Governance Kit/install-push-gate-kit.sh"

# 3. PR/merge workflow — builds on 1 and 2
bash "AI Governance Kit/install-pr-workflow-kit.sh"

# 4. Infra gate — independent of 1-3, install any time
bash "AI Governance Kit/install-infra-gate-kit.sh"

# 5. Unified PR template
mkdir -p .github
cp "AI Governance Kit/pr-template.md" .github/pull_request_template.md

# 6. Playbooks — copy as reference docs, not scripts
cp "AI Governance Kit/TESTING_HANDOFF.md" docs/
cp "AI Governance Kit/DEFECT_DISCIPLINE.md" docs/
cp "AI Governance Kit/INCIDENT_RESPONSE.md" docs/
cp "AI Governance Kit/SECRETS_MANAGEMENT.md" docs/
cp "AI Governance Kit/OBSERVABILITY_STANDARD.md" docs/
cp "AI Governance Kit/DATA_CLASSIFICATION.md" docs/
cp "AI Governance Kit/ADR_TEMPLATE.md" docs/
mkdir -p docs/adr

# 6b. Code standards + audits — CODE_STANDARDS.md needs Section 0 filled in
#     for this project's real stack before it's useful; see COMPATIBILITY.md
cp "AI Governance Kit/CODE_STANDARDS.md" docs/
cp "AI Governance Kit/STANDARDS_AUDIT.md" docs/
cp "AI Governance Kit/TEST_EFFECTIVENESS_AUDIT.md" docs/

# 7. Defect Density Kit — several scripts, no single installer (see below)

# 8. CI — pick ONE reference implementation from CI_TEMPLATES.md and copy it
#    in (GitHub Actions workflow, AWS CodeBuild buildspec, or Azure Pipelines)

# 9. Cost Gate Kit (AWS only) — deploys cloud resources, not repo files;
#    see "Installing the Cost Gate Kit" below
```

Each kit is independently useful — you don't have to install all seven. But
#3 assumes #1 and #2 exist, and the Defect Density Kit assumes #1's
`code-reviewer` agent exists (it adds a logging step to that agent's
process). Everything else stands alone.

After any install: **restart the Claude Code session** so updated hooks and
agents are picked up, and **run the verify steps** each kit's `.md` file
lists near the end — don't assume the wiring works untested.

---

## Installing the Defect Density Kit (manual — no single script)

Unlike the other kits, this one touches several files with real
project-specific decisions (release command pattern, initial threshold
baseline), so it's installed by hand per `DEFECT_DENSITY_KIT.md`'s own
checklist rather than a one-shot script:

```bash
mkdir -p scripts .claude
# Copy scripts/count-kloc.sh, log-defect.sh, defect-density.sh,
# init-defect-density-baseline.sh, require-infra-approval.sh from
# DEFECT_DENSITY_KIT.md §1-5, chmod +x each.

scripts/init-defect-density-baseline.sh   # bootstraps the threshold at measured reality

# Then: wire the hook into .claude/settings.json (§6), add the log-defect
# step to .claude/agents/code-reviewer.md (§7, only if Agent Governance Kit
# is installed), wire INCIDENT_RESPONSE.md's postmortem template (§8), and
# add the CI steps (§9).
```

**Release-gate default changed in v2.0.0:** `defect-density.sh` now defaults
to `--source incident,prod` (field defects only) for the release gate,
never the blended review+incident+prod number — see `DEFECT_DENSITY_KIT.md`
"Source segmentation" for why. If a project installed the pack before this
version, re-copy `scripts/defect-density.sh` and `scripts/require-release-density.sh`.

---

## Installing the Cost Gate Kit (AWS only — deploys cloud resources)

Unlike every other kit here, this one doesn't touch repo files at all — it
provisions real AWS resources (Budgets, SNS, Lambda, EventBridge, Cost
Anomaly Detection). See `cost-gate-kit.md` for the full CloudFormation
template and deploy script:

```bash
# From cost-gate-kit.md §2-3
scripts/deploy-cost-gate-kit.sh <account-id> <region> [budget] [hard-threshold] [email]
```

Confirm the SNS email subscription, tag every resource this kit should be
allowed to stop (`AutoStopOnBudget=true`), and verify per §6 before
trusting it — same discipline as every gate above.

---

## Design principles shared across every kit here

1. **Two or three layers, never one.** A soft PreToolUse hook nudges the
   agent; a hard boundary (git hook, server-side branch protection, cloud
   IAM) is the real enforcement. Every kit says so explicitly rather than
   letting the soft layer read as a guarantee.
2. **Markers are keyed to content, not booleans.** A SHA, a diff hash, a
   command hash — so approving one thing never silently approves a
   different, later thing. Staleness invalidates automatically.
3. **Ratchet, don't target.** Coverage thresholds and the defect-density
   threshold both start at *measured reality* and only tighten — loosening
   requires a visible, commented, deliberate change.
4. **Gate at the grain where the check is meaningful.** Code review gates
   every commit. Defect density gates only releases — because density is a
   trailing/aggregate metric and gating every commit on it would be
   statistically meaningless, not because it matters less.
5. **Emergency bypasses exist and are honest about it.** `--no-verify`
   works, on purpose — but leaves a reflog trace and is never silent.

---

## Adapting this pack for a new project

- **Language/framework specifics** (the `.husky/pre-commit` mechanical gates,
  `.claude/infra-gate.patterns`, the CI YAML snippets) are starting points —
  edit them for the real stack. Nothing here is meant to be copied verbatim
  and left unedited.
- **`.claude/settings.json` `permissions`** is never touched by any
  installer — it's machine/project-specific and sometimes holds secrets in
  existing repos. Only the `hooks` block is merged.
- If a project's remote host isn't GitHub or Azure DevOps, extend
  `scripts/detect-provider.sh` (and `pr-open.sh` / `pr-diff.sh`) with a
  branch for it — the pattern is the same for any REST-API-based host.
