# AI Governance Kit — index

A portable set of drop-in gates and playbooks for running Claude Code (or any
similarly-agentic tool) against a real codebase with real consequences. Every
kit is designed to be copied into a brand-new project with minimal
adaptation — the marker-file mechanism and two/three-layer design repeats
across all of them on purpose, so learning one teaches you the rest.

---

## What's in the pack

| Kit | Gates | Install |
|---|---|---|
| **Agent Governance Kit** | `git commit` — mandatory independent code review | `install-agent-governance-kit.sh` |
| **Push Gate Kit** | `git push` — fresh per-push human confirmation | `install-push-gate-kit.sh` |
| **PR Workflow Kit** | PR merge — review + separate merge confirmation | `install-pr-workflow-kit.sh` |
| **Infra Gate Kit** | destructive infra commands (`terraform apply`, cloud deletes, prod migrations...) | `install-infra-gate-kit.sh` |
| **Defect Density Kit** | releases — ratcheted KLOC-based quality gate | (see `DEFECT_DENSITY_KIT.md`, no single installer — several moving pieces, install by hand) |
| **Testing Handoff** | (playbook, not a gate) — layer model, coverage ratchet, CI design | copy `TESTING_HANDOFF.md` into `docs/` |
| **Defect Discipline** | (playbook, not a gate) — 10 rules, PR checklist | copy `DEFECT_DISCIPLINE.md` into `docs/` or `CONTRIBUTING.md` |
| **Incident Response** | (playbook, not a gate) — rollback + postmortem, feeds Defect Density | copy `INCIDENT_RESPONSE.md` into `docs/` |
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

# 7. Defect Density Kit — several scripts, no single installer (see below)
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
