# Push Gate Kit — portable across projects

A drop-in enforcement mechanism that stops an agent from `git push`ing to a
remote without a fresh, explicit, per-push confirmation from the human.
Companion to the Agent Governance Kit's code-review gate (`agent-governance-kit.md`)
— same two-layer design, same marker-file mechanism, applied to `push` instead
of `commit`.

> ⚠️ **Why this exists, not just "tell the agent not to push":** a standing
> instruction sitting in an agent's *own persistent memory* — loaded into its
> context from message one — was still overridden mid-session, because a
> compacted conversation summary described "commit then push" as an
> established session pattern, and the agent pattern-matched to the summary
> instead of cross-checking the stored instruction. A recall-based rule failed
> with the rule directly in context. Only a mechanical gate — one that blocks
> the actual command unless a fresh, command-specific artifact exists — closes
> that gap. This is the general lesson, not specific to any one project: **any
> "don't do X without asking" instruction that matters should be enforced as a
> gate, not left as a memory the agent is trusted to re-derive under context
> pressure (summarization, long sessions, pattern-matching to recent turns).**

---

## Per-project setup checklist

1. Copy `scripts/require-push-approval.sh` (step 1) — `chmod +x`.
2. Merge the additional `PreToolUse` hook entry (step 2) into the project's
   `.claude/settings.json`, into the **same** `"Bash"` matcher's `hooks` array
   as the code-review gate if that's already installed — do not create a
   second `"Bash"` matcher block, and do NOT clobber `permissions`.
3. Add `.husky/pre-push` (step 3) — `chmod +x`. If the project already has a
   `pre-push` hook for something else, prepend this block rather than
   replacing the file, same as the code-review kit's `pre-commit` handling.
4. Add `.claude/.push-approved` to `.gitignore`.
5. Add the CLAUDE.md "Push policy" section (step 4), adjusted for the
   project's actual remote-name/branch conventions if it isn't a simple
   single-remote setup.
6. Test both paths before trusting it (step 5) — confirm the gate actually
   blocks, and actually un-blocks with a correctly-written marker, don't just
   assume the wiring works.
7. Restart the agent session so the updated hooks are loaded.

Requires `jq` on `PATH` (same as the code-review kit).

---

## 1. `scripts/require-push-approval.sh`  (portable, verbatim — chmod +x)

```bash
#!/bin/bash
# PreToolUse gate: block `git push` unless a matching push-approval marker is on
# record for the current HEAD. Runs before every Bash tool call (main thread and
# subagents). Exit 2 blocks and feeds the message back to Claude.
#
# This exists because a compacted conversation summary can describe "commit then
# push" as an established session pattern even when the user's actual standing
# instruction (in memory, not in the summary) is local-only. A soft "remember not
# to push" failed under exactly that condition — this makes it a mechanical check
# instead of a recall problem.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only gate git push. Between `git` and `push` allow flags and the
# `-c key=val` form, so `git -c foo=bar push` is caught too.
echo "$COMMAND" | grep -qE '\bgit\s+((-{1,2}[^ ]+|-c\s+[^ ]+)\s+)*push\b' || exit 0

MARKER=".claude/.push-approved"
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)

if [ ! -f "$MARKER" ]; then
  echo "Blocked: no push approval on record for HEAD ($HEAD_SHA). Ask the user to explicitly confirm THIS push in THIS turn, then write \"$HEAD_SHA\" to $MARKER before retrying." >&2
  exit 2
fi

APPROVED_SHA=$(cat "$MARKER")
if [ "$APPROVED_SHA" != "$HEAD_SHA" ]; then
  echo "Blocked: push approval is stale (approved $APPROVED_SHA, HEAD is now $HEAD_SHA). Re-confirm with the user before pushing — do not reuse an old approval." >&2
  exit 2
fi
exit 0
```

---

## 2. `.claude/settings.json` — merge into the EXISTING `"Bash"` matcher's `hooks` array

If the code-review gate is already installed, `.claude/settings.json` already
has a `hooks.PreToolUse[0]` entry with `"matcher": "Bash"`. Add this object to
that same entry's `hooks` array (don't create a second matcher block):

```json
{ "type": "command", "command": "./scripts/require-push-approval.sh" }
```

Resulting shape (both gates active):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/require-review.sh" },
          { "type": "command", "command": "./scripts/require-push-approval.sh" }
        ]
      }
    ]
  }
}
```

If this kit is installed **standalone** (no code-review gate present), the
`hooks` block is just:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/require-push-approval.sh" }
        ]
      }
    ]
  }
}
```

---

## 3. `.husky/pre-push`  (chmod +x — the real boundary)

```sh
#!/usr/bin/env sh
# .husky/pre-push — the real enforcement boundary. git runs this on every push
# regardless of how it was invoked, so unlike the PreToolUse hook it cannot be
# sidestepped by sh -c or aliases.
# Emergency bypass (leaves a trace in reflog): git push --no-verify
set -e

# ── Push-approval gate (Agent Governance Kit) ─────────────────────────────────
MARKER=".claude/.push-approved"
HEAD_SHA=$(git rev-parse HEAD)
if [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$HEAD_SHA" ]; then
  echo "❌ No fresh push approval on record for $HEAD_SHA." >&2
  echo "   To approve manually: echo $HEAD_SHA > $MARKER" >&2
  echo "   Emergency bypass (leaves a trace): git push --no-verify" >&2
  exit 1
fi
echo "✅ Push approval matches HEAD ($HEAD_SHA)."
```

If the project already has a `pre-push` hook doing something else (e.g. a
size check, a branch-name lint), prepend this block to the existing file
rather than overwriting it — same pattern the code-review kit uses for
`pre-commit`.

---

## 4. CLAUDE.md section

```markdown
## Push policy

This repo is worked **local-only**: commit to local `main`/`<default branch>`
freely, but never `git push` to the remote without the user explicitly
confirming *that specific push, in that turn*. A general "yes, push things"
earlier in the conversation does not count — re-confirm every time, especially
after a compacted summary, since a summary describing "commit then push" as an
established pattern is not the same as the user asking for this push.

A PreToolUse hook blocks `git push` unless `.claude/.push-approved` exists and
contains the current `HEAD` SHA (write it only after the user's explicit
go-ahead: `git rev-parse HEAD > .claude/.push-approved`). A git `pre-push` hook
enforces the same check as the real boundary. If you hit either block, that
means push wasn't actually confirmed — go back and ask, don't work around it.
```

Adjust the first paragraph if the project's actual policy is "push freely to
a feature branch but gate pushes to `main`/`origin` specifically" — the
marker mechanism doesn't care which remote/branch, so the gating scope is a
policy choice, not a limitation of the hook. For a branch-scoped version,
add a check in step 1's script comparing `$(git branch --show-current)` (or
parsing the ref from the hook's stdin) against a protected-branches list
before requiring the marker.

---

## 5. Verify before trusting it

Don't assume the wiring works — test both paths:

```bash
# 1. Confirm it blocks with no marker present
rm -f .claude/.push-approved
git push --dry-run   # expect: ❌ blocked, exit non-zero

# 2. Confirm it un-blocks with a correctly-written marker
git rev-parse HEAD > .claude/.push-approved
git push --dry-run   # expect: ✅ approval matches HEAD
rm -f .claude/.push-approved   # clean up — don't leave a stale approval sitting around
```

---

## How it fits together (the two-layer design, same as the code-review gate)

- **Layer 1 — PreToolUse hook (`require-push-approval.sh`):** soft
  forcing-function aimed specifically at the *agent*. Nudges it to get
  explicit confirmation before ever calling `git push`. Evadable by design
  (`sh -c`, aliases) — it shapes agent behavior, it does not guarantee it.
- **Layer 2 — git `pre-push` hook:** the real boundary. git runs it on every
  push regardless of caller (agent or human), so it can't be sidestepped by
  `sh -c` or aliases. `--no-verify` bypasses it but leaves a reflog trace —
  same honest limitation the code-review kit states about its own gate.

The `.push-approved` marker is the exact SHA of the commit approved to push,
written only in direct response to the user's explicit go-ahead **in the
current turn**. Because it's keyed to a specific commit SHA (not a boolean
flag), approving one push never silently approves the next commit — every new
commit invalidates the prior approval and requires a fresh one. This is
deliberately stricter than the review-pass marker's diff-hash approach: a
push is a one-way action visible to everyone with remote access (and, if CI is
wired to push events, one that can trigger builds/deploys/notifications the
moment it lands) — cheaper to over-gate than a local commit is.
