# Incident Response & Rollback — a portable playbook

Every kit in this pack is about preventing a bad change from landing:
review before commit, approval before push, review + approval before merge,
confirmation before a destructive infra command, a ratcheted density gate
before release. **None of them cover what happens when a bad change lands
anyway.** This doc is that missing piece — a defined, fast path for the one
moment you'd most want one.

> The other kits deliberately slow the agent down with confirmations. An
> incident is the one context where speed matters more than usual — this
> playbook does **not** bypass any gate (no `--no-verify`, no skipped
> review). It compresses the *human* turnaround, not the mechanical one.

---

## 1. First move: revert, don't re-fix forward

When a shipped change is causing active harm, the fastest safe action is
almost always **reverting the change**, not diagnosing and hand-fixing it
live. Fix-forward under pressure is how a second defect gets introduced on
top of the first one.

```bash
# Preferred: a revert commit — preserves history, safe on a shared branch,
# and goes through the SAME gates as any other commit (still needs review +
# push approval — see §2 for the fast path on that).
git revert <bad-commit-sha>

# Only if the bad commit is unpublished / on a branch nobody else has pulled:
git reset --hard <last-good-sha>   # rewrites history — confirm no one else
                                     # has based work on the reverted commits
```

If the bad change was a deploy (not just a commit), also roll back the
**deployed artifact**, not just the git history — redeploy the last known-good
build/image/tag through the normal deploy path. A `git revert` alone doesn't
undo an already-running bad process.

If the bad change was an infra action gated by `infra-gate-kit.md` (a
migration, a config push), the rollback is whatever that system's own
rollback primitive is (`terraform apply` of the prior state, restoring a DB
from the pre-migration backup, re-linking a billing account) — it still goes
through that same infra gate, because a rollback command is itself a
destructive infra command.

---

## 2. The fast path — compressed, not bypassed

| Normal flow | Incident flow |
|---|---|
| Feature branch → PR → review → merge-confirm → merge | Revert commit → **same** review → **same** push/merge confirm, but ask for it **immediately, in the same turn**, framed explicitly as an incident |
| Review runs the full checklist | Review still runs — a revert can itself be wrong (reverts the wrong commit, reverts more than intended) |
| Merge confirmation can wait for the user's convenience | Merge confirmation is requested **now**, with the incident context stated plainly so the user understands the urgency and what they're approving |

Concretely: the agent still delegates to `code-reviewer`, still writes
`.review-pass`, still needs `.push-approved` / `.merge-approved-<PR#>` with
matching SHAs. What changes is **tone and timing** — the agent asks for
confirmation immediately and explains why, rather than batching it with
other work. No marker is ever written without the human's real turn-taking
confirmation, incident or not — a compromised gate during an incident is how
incidents get worse, not better.

**Emergency bypass exists (`--no-verify`) but leaves a reflog trace, same as
every other kit in this pack** — use it only if the human explicitly directs
it, and say so plainly when you do, don't do it quietly under pressure.

---

## 3. Postmortem — required, and it feeds the defect-density metric

Every incident gets a postmortem **and** a defect-log entry — the postmortem
is for humans, the log entry is what makes `DEFECT_DENSITY_KIT.md`'s
tracking real instead of aspirational.

```bash
# After the fix/revert has landed and the incident is confirmed resolved:
scripts/log-defect.sh \
  --severity Critical \
  --class "<name the CLASS — e.g. 'missing null check on webhook payload'>" \
  --files "<comma-separated files that introduced the bug>" \
  --source incident \
  --commit <sha-that-introduced-it, not the revert>
```

### Postmortem template

```markdown
## Incident: <one-line summary>

**Detected:** <date/time, how — alert, user report, manual check>
**Resolved:** <date/time>
**Impact:** <who/what was affected, for how long, blast radius>

### What happened
<Plain description of the failure mode.>

### Root cause
<The actual root cause, not just the symptom. If unknown yet, say so
explicitly — don't guess and present it as fact (DEFECT_DISCIPLINE Rule 5).>

### Defect class (DEFECT_DISCIPLINE Rule 1)
<Name the class. Then: did you enumerate every other member of that class
elsewhere in the codebase? List what you checked, and what you found.>

### Timeline
- <time> — <event>
- <time> — <event>

### What caught it (or didn't)
<Which layer should have caught this and didn't — a missing test? A gate
that wasn't installed? A threshold set too loose? Be specific — this is the
input to "what do we add/change" below.>

### Follow-up actions
- [ ] Defect logged: `scripts/log-defect.sh ...` (paste the command run)
- [ ] Fix-before/pass-after regression test added (DEFECT_DISCIPLINE Rule 6)
- [ ] Class enumerated across the codebase (Rule 1) — link the search/diff
- [ ] Gate/threshold change, if any, made explicitly with a comment
- [ ] Anything that should become a new pattern in `.claude/infra-gate.patterns`
      or a new rule in `DEFECT_DISCIPLINE.md`, if this incident revealed a gap
```

Store postmortems wherever the project already keeps docs (`docs/postmortems/`
is a reasonable default) — this playbook doesn't mandate a location, only
that one is picked and used consistently.

---

## 4. Per-project setup checklist

1. Add this file to the project (as-is, or adapted).
2. Pick and create a postmortem storage location (e.g. `docs/postmortems/`).
3. If `DEFECT_DENSITY_KIT.md` is installed, nothing else to wire — the
   `log-defect.sh --source incident` call above is the integration point.
4. If `infra-gate-kit.md` is installed, confirm the project's actual
   rollback commands (DB restore, `terraform apply` of prior state, etc.)
   are covered by `.claude/infra-gate.patterns` — a rollback is still a
   destructive infra command and should still be gated, just fast-pathed on
   the human-confirmation side per §2.
5. Add a link to this file from the project's on-call/runbook docs, if any
   exist, so it's discoverable at 2am and not just in a governance-kit folder.

---

## How it fits with the rest of the pack

- Doesn't weaken any existing gate — every marker still requires the same
  real confirmation.
- Turns every incident into a `defects.jsonl` entry, so
  `DEFECT_DENSITY_KIT.md`'s release gate actually reflects production
  reality, not just what code review caught.
- Closes the loop DEFECT_DISCIPLINE.md's Rule 1 implies but doesn't spell
  out operationally: a postmortem's "was the class enumerated elsewhere"
  section is Rule 1 applied to something that already escaped to production.
