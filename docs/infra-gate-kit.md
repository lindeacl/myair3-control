# Infra Gate Kit — portable across projects

A drop-in enforcement mechanism that stops an agent from running a
**destructive infrastructure command** — `terraform apply`, `gcloud ... delete`,
a prod DB migration, disabling billing, pushing to a prod container registry —
without a fresh, explicit, command-specific confirmation from the human.
Same two-layer design and marker-file mechanism as `push-gate-kit.md`, applied
to infra tooling instead of `git push`.

> ⚠️ **Why this exists:** the other three kits in this pack (agent-governance,
> push-gate, pr-workflow) gate **code** — commit, push, merge. None of them
> gate the moment an agent steps *outside* git and runs `terraform apply` or
> `gcloud sql instances delete` directly against a live cloud account. That's
> the same "a memory-based rule failed under context pressure" problem
> `push-gate-kit.md` documents for pushes — except for infra commands the
> blast radius is usually bigger and the action is often **irreversible**
> (a dropped instance, a disabled billing account, a deleted bucket). If your
> agent has cloud CLI access, install this kit.

---

## Per-project setup checklist

1. Copy `scripts/require-infra-approval.sh` (step 1) — `chmod +x`.
2. Copy `.claude/infra-gate.patterns` (step 2) — the default pattern list.
   **Edit it for this project's actual tooling** — the defaults cover common
   Terraform/GCP/AWS/Azure/K8s/DB-migration/Docker shapes, but every project's
   real danger list differs (a project with no Kubernetes doesn't need the
   `kubectl` pattern; a project on Cloudflare needs a `wrangler` pattern
   instead).
3. Merge the additional `PreToolUse` hook entry (step 3) into the project's
   `.claude/settings.json`, into the **same** `"Bash"` matcher's `hooks` array
   as the other gates if already installed — do not create a second matcher
   block, and do NOT clobber `permissions`.
4. Add `.claude/.infra-approved-*` to `.gitignore`.
5. Add the CLAUDE.md "Infra change policy" section (step 4).
6. **Configure the real boundary for this project's cloud provider(s)** (step
   5) — same honest limitation as the other kits: a local hook cannot
   intercept an API call to a cloud control plane the way a git hook
   intercepts `git push`. This kit's script is a soft, agent-facing nudge;
   the hard boundary has to live on the provider side.
7. Test both paths before trusting it (step 6).
8. Restart the agent session so the updated hooks are loaded.

Requires `jq` and `shasum` on `PATH`.

---

## 1. `scripts/require-infra-approval.sh`  (portable, verbatim — chmod +x)

```bash
#!/bin/bash
# PreToolUse gate: block a configured list of destructive infrastructure
# commands unless a fresh, command-specific approval marker is on record.
# Runs before every Bash tool call (main thread and subagents). Exit 2 blocks
# and feeds the message back to the agent.
#
# Unlike the push/merge gates, there is no meaningful "HEAD SHA" for an infra
# command — a `terraform apply` or `gcloud ... delete` isn't tied to a git
# commit. The marker is instead keyed to a SHA-256 of the EXACT matched
# command string, so approving one destructive command never silently
# approves a different one, even if both match the same pattern.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

PATTERNS_FILE=".claude/infra-gate.patterns"
if [ ! -f "$PATTERNS_FILE" ]; then
  # No patterns configured for this project yet — nothing to gate.
  exit 0
fi

MATCHED=""
while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  case "$pattern" in \#*) continue ;; esac
  if echo "$COMMAND" | grep -qE "$pattern"; then
    MATCHED=1
    break
  fi
done < "$PATTERNS_FILE"
[ -z "$MATCHED" ] && exit 0

CMD_HASH=$(printf '%s' "$COMMAND" | shasum -a 256 | cut -d' ' -f1)
MARKER=".claude/.infra-approved-$CMD_HASH"

if [ ! -f "$MARKER" ]; then
  echo "Blocked: this command matches a configured destructive-infra pattern in $PATTERNS_FILE." >&2
  echo "  Command: $COMMAND" >&2
  echo "  Ask the user to explicitly confirm THIS command in THIS turn, then run:" >&2
  echo "    echo ok > $MARKER" >&2
  echo "  A different command (even a near-identical retry) needs its own fresh confirmation." >&2
  exit 2
fi
exit 0
```

---

## 2. `.claude/infra-gate.patterns`  (starting defaults — EDIT per project)

One `grep -E` pattern per line. Lines starting with `#` are comments. Delete
patterns that don't apply to this project's stack; add ones that do (the
list below is a reasonable starting point, not exhaustive).

```
# Infra Gate Kit — destructive command patterns
# One grep -E pattern per line. Edit for THIS project's actual tooling.

# Terraform / OpenTofu
\bterraform\s+(apply|destroy)\b
\btofu\s+(apply|destroy)\b

# GCP: deletions and billing changes
\bgcloud\s+.*\bdelete\b
\bgcloud\s+billing\s+projects\s+link\b
\bgcloud\s+billing\s+accounts\s+.*disable\b
\bgcloud\s+sql\s+instances\s+delete\b

# AWS
\baws\s+.*\bdelete-
\baws\s+s3\s+rm\s+.*--recursive\b
\baws\s+rds\s+delete-db-instance\b

# Azure
\baz\s+.*\bdelete\b

# Kubernetes — applying/deleting against a non-local context
\bkubectl\s+(apply|delete)\b.*--context[= ](prod|production)\b

# Database migrations against a non-local environment
\b(npx\s+)?(prisma|knex|sequelize|alembic|flyway)\s+.*(migrate|upgrade)\b.*(NODE_ENV=production|--env[= ]prod)

# Container registry — pushing a prod-tagged image
\bdocker\s+push\s+.*:(prod|production|latest)\b

# Cloudflare (if applicable — delete if unused)
# \bwrangler\s+.*\bdelete\b
```

---

## 3. `.claude/settings.json` — merge into the EXISTING `"Bash"` matcher

```json
{ "type": "command", "command": "./scripts/require-infra-approval.sh" }
```

Resulting shape with all four kits installed:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/require-review.sh" },
          { "type": "command", "command": "./scripts/require-push-approval.sh" },
          { "type": "command", "command": "./scripts/require-merge-approval.sh" },
          { "type": "command", "command": "./scripts/require-infra-approval.sh" }
        ]
      }
    ]
  }
}
```

---

## 4. CLAUDE.md section

```markdown
## Infra change policy

Destructive infrastructure commands (`terraform apply/destroy`, cloud-provider
delete calls, billing account changes, prod database migrations, prod
registry pushes — see `.claude/infra-gate.patterns` for this project's exact
list) require the user's **explicit, command-specific confirmation in the
current turn** before running. A prior general "yes, go ahead with the infra
work" does not count — re-confirm every distinct command.

A PreToolUse hook blocks any command matching `.claude/infra-gate.patterns`
unless `.claude/.infra-approved-<hash-of-that-exact-command>` exists. If you
hit that block, that means this specific command wasn't actually confirmed —
go back and ask, don't work around it, and don't approve a *similar* command
using an old marker (the hash won't match).

This is a soft, agent-facing nudge, not the real security boundary — the real
boundary is [describe this project's actual provider-side protection here:
Terraform Cloud plan/apply separation, an Atlantis approval step, GCP org
policy requiring a second approver, a Cloud Deploy/CodePipeline manual
approval stage, IAM restricting who holds the destructive role in the first
place]. State plainly to whoever reads this that the hook alone is not a
guarantee.
```

---

## 5. The real boundary (provider-side — configure once per project)

A local hook can intercept the agent's own Bash tool call, but it **cannot**
intercept a human (or a different, ungated process) making the same API call
directly, and it cannot stop the *cloud provider* from executing the request
once sent — same honest limitation `push-gate-kit.md` and `pr-workflow-kit.md`
already state about their own layers. Pick the real boundary for this
project's stack and configure it once, outside the agent's control:

- **Terraform:** run `apply` only through Terraform Cloud / Atlantis with a
  required plan-then-approve step, not `terraform apply` from a local/agent
  shell directly against a real backend.
- **GCP:** an Organization Policy restricting who can hold
  `roles/billing.admin` / delete permissions; a second-approver requirement
  on sensitive projects.
- **AWS:** IAM permission boundaries / SCPs restricting delete-class actions
  to a break-glass role, not the agent's default credentials.
- **Kubernetes:** RBAC scoping the agent's kubeconfig context to non-prod
  clusters entirely, so a matching command has nothing to reach.
- **CI/CD:** a manual-approval stage in the deploy pipeline (GitHub
  Environments with required reviewers, Azure Pipelines approval checks,
  CodePipeline manual approval action) in front of any prod deploy step.

Without a provider-side boundary, this kit is honor-system enforcement on the
agent's own tool calls — say so plainly to whoever installs it.

---

## 6. Verify before trusting it

```bash
# 1. Confirm it blocks a matching command with no marker present
echo '{"tool_input":{"command":"terraform destroy -auto-approve"}}' \
  | ./scripts/require-infra-approval.sh
# expect: exit 2, "Blocked: this command matches..."

# 2. Confirm a NON-matching command passes straight through
echo '{"tool_input":{"command":"terraform plan"}}' \
  | ./scripts/require-infra-approval.sh
# expect: exit 0, no output

# 3. Confirm the marker unblocks the EXACT command, and only that command
CMD='terraform destroy -auto-approve'
HASH=$(printf '%s' "$CMD" | shasum -a 256 | cut -d' ' -f1)
echo ok > ".claude/.infra-approved-$HASH"
echo "{\"tool_input\":{\"command\":\"$CMD\"}}" | ./scripts/require-infra-approval.sh
# expect: exit 0

echo '{"tool_input":{"command":"terraform destroy -target=module.other -auto-approve"}}' \
  | ./scripts/require-infra-approval.sh
# expect: exit 2 — a DIFFERENT command, even if similarly destructive, needs its own marker

rm -f ".claude/.infra-approved-$HASH"   # clean up
```

---

## How it fits together

- **Layer 1 — PreToolUse hook (`require-infra-approval.sh`):** soft
  forcing-function aimed at the agent. Evadable by design (`sh -c`, a
  differently-worded but equivalent command) — it shapes agent behavior, it
  does not guarantee it.
- **Layer 2 — provider-side boundary** (§5): the actual hard boundary,
  configured once per project, outside the agent's control entirely — which
  is the point, same as the other kits' server-side/git-hook layers.

The marker is keyed to a content hash of the **exact command string**, not a
git SHA (infra commands aren't git operations) and not a boolean flag —
approving one destructive command never silently approves a differently-worded
one, even against the same resource.
