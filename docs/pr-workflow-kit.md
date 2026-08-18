# PR Workflow Kit — portable across projects

A drop-in branch/PR workflow that lets an agent work on feature branches freely,
then hands routine, clean changes off to the existing independent reviewer to
merge under its own authority — without every single change needing a human in
the loop — while keeping one deliberate human touchpoint before anything lands
on a protected branch. Companion to `agent-governance-kit.md` (code-review gate)
and `push-gate-kit.md` (push-approval gate); reuses both.

> **Trust model, stated plainly:** clean review ≠ automatic merge. The
> independent reviewer's approval is **necessary but not sufficient** — it's a
> quality gate, not a merge authorization. Merging to a protected branch is a
> one-way, everyone-can-see-it action (and, if CI is wired to the branch, one
> that can trigger deploys), so it keeps its own lightweight, per-PR human
> confirmation on top of a clean review — reusing the push-gate kit's exact
> marker mechanism, just scoped to "merge PR #N" instead of "push these
> commits." This is a deliberate, narrower trust step than "the agent can
> merge anything it approves of," and the kit is built around that choice —
> adapt the merge-gate script if a project genuinely wants fuller autonomy.

---

## Why a workflow change, not just another gate

The push-gate kit (companion doc) blocks direct pushes to a protected branch
without fresh confirmation. Applied literally to *every* push, that also blocks
pushing a feature branch that nobody's going to see until it's reviewed —
which defeats the point of branching (isolate risk) by making every branch as
expensive to push as a direct main change. This kit resolves that by splitting
the two:

- **Feature branches** — freely pushable, no per-push confirmation. Nothing
  user-facing happens until merge, so there's nothing to gate yet.
- **Protected branches** (`main`/`master`/configured list) — still gated,
  exactly as the push-gate kit already does, for the rare direct-push case.
- **Merging a reviewed PR onto a protected branch** — a new, separate gate:
  requires (a) a clean independent review of the PR's actual diff, AND (b) one
  fresh, PR-specific human confirmation. Neither alone is sufficient.

---

## Per-project setup checklist

1. Install `agent-governance-kit.md` (code-review gate) and `push-gate-kit.md`
   (push-approval gate) first — this kit builds on both and assumes their
   markers/scripts already exist.
2. Copy `scripts/detect-provider.sh` (step 1) — `chmod +x`. Auto-detects
   GitHub vs. Azure DevOps from `git remote get-url origin`; extend it if the
   project uses a third host (Bitbucket, GitLab) by adding a branch and the
   equivalent PR-API calls.
3. Copy `scripts/pr-open.sh` (step 2) — `chmod +x`. Opens a PR via `gh pr
   create` (GitHub) or the Azure DevOps REST API + PAT (no `az` CLI required).
4. Copy `scripts/pr-diff.sh` (step 3) — `chmod +x`. Fetches a PR's actual diff
   for the reviewer to read, per provider.
5. Copy `scripts/require-merge-approval.sh` (step 4) — `chmod +x`. PreToolUse
   gate blocking the merge call unless both markers are present and fresh.
6. Update `.husky/pre-push` (step 5) to exempt non-protected branches from the
   push-gate kit's check.
7. Merge the additional `PreToolUse` hook entry (step 6) into
   `.claude/settings.json`'s existing `"Bash"` matcher.
8. Add `.claude/.pr-review-pass-*` and `.claude/.merge-approved-*` to
   `.gitignore`.
9. **Configure server-side branch protection** (step 7) — this is the *real*
   enforcement boundary for the merge step; a local hook cannot intercept an
   arbitrary `gh`/`curl` call to a remote API the way `.husky/pre-push`
   intercepts `git push`. Skipping this step leaves the merge gate as an
   honor-system nudge only, same honest limitation the other two kits state
   about their own PreToolUse layer.
10. Add the CLAUDE.md "PR workflow policy" section (step 8).
11. If using Azure DevOps: set `AZURE_DEVOPS_PAT` as an environment variable
    (never commit it, never echo it, never put it in a script argument list
    where it could show up in `ps`). Scopes needed: **Code (Read & Write)**,
    **Pull Request Threads (Read & Write)**.
12. Test the branch-exemption and merge-gate paths (step 9) before trusting
    them.
13. Restart the agent session so the updated hooks are loaded.

---

## 1. `scripts/detect-provider.sh`  (portable, verbatim — chmod +x)

```bash
#!/bin/bash
# Prints "github" or "azure" based on the origin remote. Exits 1 with a clear
# message for anything else — extend with another branch here to add a host.
REMOTE=$(git remote get-url origin 2>/dev/null)
if [[ "$REMOTE" == *github.com* ]]; then
  echo "github"
elif [[ "$REMOTE" == *dev.azure.com* || "$REMOTE" == *visualstudio.com* ]]; then
  echo "azure"
else
  echo "Unrecognized remote host: $REMOTE" >&2
  echo "Add a branch to scripts/detect-provider.sh (and pr-open.sh / pr-diff.sh) for this host." >&2
  exit 1
fi
```

---

## 2. `scripts/pr-open.sh`  (portable — chmod +x)

```bash
#!/bin/bash
# Opens a PR from the current branch against the given base branch (default
# main). Prints the PR number/URL on success. Requires the current branch to
# already be pushed.
set -euo pipefail
BASE="${1:-main}"
TITLE="${2:?Usage: pr-open.sh <base-branch> <title> [body]}"
BODY="${3:-}"
BRANCH=$(git branch --show-current)
PROVIDER=$(./scripts/detect-provider.sh)

if [ "$PROVIDER" = "github" ]; then
  gh pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body "$BODY"
  exit 0
fi

# ── Azure DevOps: REST API + PAT, no az CLI required ──────────────────────────
: "${AZURE_DEVOPS_PAT:?Set AZURE_DEVOPS_PAT (scopes: Code R/W, PR Threads R/W)}"
REMOTE=$(git remote get-url origin)
ORG=$(echo "$REMOTE" | sed -E 's#https://dev.azure.com/([^/]+)/.*#\1#')
REPO=$(basename "$REMOTE")
# Azure DevOps has two URL shapes: .../ORG/PROJECT/_git/REPO, and the
# shorthand .../ORG/_git/REPO used when PROJECT == REPO. A naive
# project-extraction sed handling only the first shape silently fails to
# match on the shorthand (caught in testing against a real shorthand remote)
# and leaves PROJECT set to the entire unmodified $REMOTE string, producing
# a malformed API URL — check the shape explicitly.
if echo "$REMOTE" | grep -qE '^https://dev\.azure\.com/[^/]+/_git/'; then
  PROJECT="$REPO"
else
  PROJECT=$(echo "$REMOTE" | sed -E 's#https://dev.azure.com/[^/]+/([^/]+)/_git/.*#\1#')
fi
AUTH=$(printf ':%s' "$AZURE_DEVOPS_PAT" | base64)

curl -sf -X POST \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/git/repositories/$REPO/pullrequests?api-version=7.1" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg src "refs/heads/$BRANCH" --arg dst "refs/heads/$BASE" \
        --arg title "$TITLE" --arg desc "$BODY" \
        '{sourceRefName:$src, targetRefName:$dst, title:$title, description:$desc}')" \
  | jq '{pullRequestId, url: .repository.webUrl}'
```

Security note: the PAT is passed via an HTTP header, not a `-u user:pass`
CLI flag, specifically so it doesn't appear in `ps`/process-listing output on
systems where that's visible to other local users. Never log the raw `curl`
command; never write the PAT to a file.

---

## 3. `scripts/pr-diff.sh`  (portable — chmod +x)

```bash
#!/bin/bash
# Fetches a PR's diff for the reviewer to read. Usage: pr-diff.sh <pr-number>
set -euo pipefail
PR="${1:?Usage: pr-diff.sh <pr-number>}"
PROVIDER=$(./scripts/detect-provider.sh)

if [ "$PROVIDER" = "github" ]; then
  gh pr diff "$PR"
  exit 0
fi

: "${AZURE_DEVOPS_PAT:?Set AZURE_DEVOPS_PAT}"
REMOTE=$(git remote get-url origin)
ORG=$(echo "$REMOTE" | sed -E 's#https://dev.azure.com/([^/]+)/.*#\1#')
REPO=$(basename "$REMOTE")
# Azure DevOps has two URL shapes: .../ORG/PROJECT/_git/REPO, and the
# shorthand .../ORG/_git/REPO used when PROJECT == REPO — handle both, the
# naive single-sed version silently mis-parses the shorthand (see pr-open.sh).
if echo "$REMOTE" | grep -qE '^https://dev\.azure\.com/[^/]+/_git/'; then
  PROJECT="$REPO"
else
  PROJECT=$(echo "$REMOTE" | sed -E 's#https://dev.azure.com/[^/]+/([^/]+)/_git/.*#\1#')
fi
AUTH=$(printf ':%s' "$AZURE_DEVOPS_PAT" | base64)

# Azure DevOps has no single "diff" endpoint — resolve the PR's source/target
# commits, then diff locally against the already-fetched refs.
PR_INFO=$(curl -sf \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/git/repositories/$REPO/pullrequests/$PR?api-version=7.1" \
  -H "Authorization: Basic $AUTH")
SRC_SHA=$(echo "$PR_INFO" | jq -r '.lastMergeSourceCommit.commitId')
DST_SHA=$(echo "$PR_INFO" | jq -r '.lastMergeTargetCommit.commitId')
git fetch origin "$SRC_SHA" "$DST_SHA" --quiet
git diff "$DST_SHA".."$SRC_SHA"
```

---

## 4. `scripts/require-merge-approval.sh`  (portable — chmod +x)

```bash
#!/bin/bash
# PreToolUse gate: block a PR-merge command unless BOTH markers are present
# and fresh for the PR being merged — a clean independent review AND a
# separate human merge confirmation. Neither alone is sufficient. Exit 2
# blocks and feeds the message back to the agent.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

MATCHED=""
# Match "gh ... pr merge ..." rather than requiring gh/pr/merge to be
# contiguous — a real invocation can carry flags between them, e.g.
# `gh --repo owner/repo pr merge 42`. Requiring \bgh\s+pr\s+merge\b (all
# three tokens contiguous) misses that shape entirely — caught in testing
# as a false negative, the gate silently let a real merge through.
if echo "$COMMAND" | grep -qE '\bgh\b' && echo "$COMMAND" | grep -qE '\bpr\s+merge\b'; then
  MATCHED=1
elif echo "$COMMAND" | grep -qE 'pullrequests/[0-9]+\?api-version' \
  && echo "$COMMAND" | grep -qE '(-X|--request)\s*PATCH'; then
  MATCHED=1
fi
[ -z "$MATCHED" ] && exit 0

# Strip any token that starts with a letter (org/project/repo names, flag
# names, "pullrequests", "api-version", ...) before grabbing the first
# remaining digit run. A plain `grep -oE '[0-9]+' | head -1` grabs the wrong
# number whenever an org/project/repo name contains a digit — caught in
# testing: ".../repositories/repo1/pullrequests/99..." extracted "1" from
# "repo1" instead of the real PR number 99, which would check/write the
# wrong marker files entirely.
PR=$(echo "$COMMAND" | sed -E 's/[A-Za-z][A-Za-z0-9]*//g' | grep -oE '[0-9]+' | head -1)
if [ -z "$PR" ]; then
  echo "Blocked: could not determine PR number from command; approve manually or fix this script's PR-number extraction." >&2
  exit 2
fi

REVIEW_MARKER=".claude/.pr-review-pass-$PR"
MERGE_MARKER=".claude/.merge-approved-$PR"

if [ ! -f "$REVIEW_MARKER" ]; then
  echo "Blocked: no clean independent review on record for PR #$PR. Run the reviewer against this PR's diff first." >&2
  exit 2
fi
if [ ! -f "$MERGE_MARKER" ]; then
  echo "Blocked: PR #$PR passed review, but merging still needs a separate, fresh human confirmation. Ask the user to confirm merging THIS PR in THIS turn, then write its head SHA to $MERGE_MARKER." >&2
  exit 2
fi

REVIEWED_SHA=$(cat "$REVIEW_MARKER")
APPROVED_SHA=$(cat "$MERGE_MARKER")
if [ "$REVIEWED_SHA" != "$APPROVED_SHA" ]; then
  echo "Blocked: the reviewed commit ($REVIEWED_SHA) and the merge-approved commit ($APPROVED_SHA) don't match — the PR moved since one of these was written. Re-review and re-confirm." >&2
  exit 2
fi
exit 0
```

---

## 5. `.husky/pre-push` — exempt non-protected branches

Add this check **above** the existing push-gate kit block, so protected
branches still go through the full gate and everything else skips it:

```sh
# ── Branch exemption (PR Workflow Kit) ────────────────────────────────────────
# Feature branches push freely — nothing user-facing happens until merge, so
# there's nothing to gate yet. Only protected branches hit the push-approval
# check below.
PROTECTED_BRANCHES="main master"
CURRENT_BRANCH=$(git branch --show-current)
IS_PROTECTED=false
for b in $PROTECTED_BRANCHES; do
  [ "$CURRENT_BRANCH" = "$b" ] && IS_PROTECTED=true
done
if [ "$IS_PROTECTED" = false ]; then
  echo "✅ Pushing non-protected branch '$CURRENT_BRANCH' — push-approval gate skipped."
  exit 0
fi

# ── Push-approval gate (Agent Governance Kit — unchanged below) ──────────────
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

Adjust `PROTECTED_BRANCHES` to match the project's actual convention
(`main`, `master`, `production`, `release/*`, whatever applies).

---

## 6. `.claude/settings.json` — merge into the EXISTING `"Bash"` matcher

Add alongside the code-review and push-approval entries:

```json
{ "type": "command", "command": "./scripts/require-merge-approval.sh" }
```

---

## 7. Server-side branch protection (the real Layer-2 boundary)

A local git hook can intercept `git push` unconditionally (git always runs
`pre-push`), but it **cannot** intercept an arbitrary `gh pr merge` or `curl`
call to a remote API the same way — those are just HTTP requests, not git
plumbing. So the PreToolUse gate above is a soft, agent-facing nudge only
(same honest limitation the other two kits already state about their own
PreToolUse layer) — the actual hard boundary has to live on the remote:

**GitHub:** Settings → Branches → branch protection rule on the protected
branch → require a pull request before merging, require status checks to
pass (wire the reviewer's pass/fail as a check via `gh pr comment` +
a required status, or a lightweight Actions job that fails if
`.claude/.pr-review-pass-*` isn't present in the PR's diff artifact).

**Azure DevOps:** Project Settings → Repositories → `<repo>` → Policies on the
protected branch → require a minimum number of reviewers, require linked
work items optionally, and — if wanting real server-side enforcement, not
just convention — add a **build validation** policy pointing at a pipeline
that fails unless the review marker is present.

Without this step, the kit is honor-system enforcement on the agent's own
tool calls, not a real boundary — say so plainly to whoever installs this,
don't let the PreToolUse gate alone read as a guarantee it isn't.

---

## 8. CLAUDE.md section

```markdown
## PR workflow policy

Work happens on feature branches (`agent/<short-slug>`), not direct commits
to `main`. Feature branches push freely, no confirmation needed — nothing
user-facing happens until merge. Opening a PR: `scripts/pr-open.sh <base>
<title> [body]`.

Before merging: delegate to the `code-reviewer` subagent against the PR's
actual diff (`scripts/pr-diff.sh <pr-number>`), not just the local working
tree. Zero Critical issues → write `.claude/.pr-review-pass-<PR#>` with the
PR's head SHA (mirrors `.review-pass`'s mechanism).

**Clean review does not authorize merging by itself.** Merging to `main` is a
one-way, visible-to-everyone action — it needs its own fresh confirmation:
ask the user to confirm merging *this specific PR* in *this turn*, then write
`.claude/.merge-approved-<PR#>` with the same head SHA. A PreToolUse hook
blocks the merge call unless both markers exist and match; a real boundary
also exists via branch protection on the remote (required reviews/status
checks) — the hook is a nudge, the branch protection is the actual gate.
```

---

## 9. Verify before trusting it

```bash
# Branch exemption: pushing a feature branch should skip the gate entirely.
# A brand-new branch has no upstream yet, so name the remote explicitly —
# `git push --dry-run` alone fails with "no upstream branch" here, which is
# a red herring unrelated to this gate.
git checkout -b test/push-gate-exemption
git push --dry-run origin test/push-gate-exemption   # expect: ✅ skipped, no marker required

# Protected branch: should still require the push-gate kit's marker
git checkout main
rm -f .claude/.push-approved
git push --dry-run   # expect: ❌ blocked, same as before this kit

git branch -D test/push-gate-exemption   # clean up

# Merge gate: simulate both marker states
echo "someshasomeshasomeshasomeshasomesha1234" > .claude/.pr-review-pass-999
echo '{"tool_input":{"command":"gh pr merge 999"}}' | ./scripts/require-merge-approval.sh
# expect: exit 2, "merging still needs a separate, fresh human confirmation"

echo "someshasomeshasomeshasomeshasomesha1234" > .claude/.merge-approved-999
echo '{"tool_input":{"command":"gh pr merge 999"}}' | ./scripts/require-merge-approval.sh
# expect: exit 0 (both markers present and matching)

rm -f .claude/.pr-review-pass-999 .claude/.merge-approved-999   # clean up
```

---

## How it fits together (three layers, extending the two-layer pattern)

- **Layer 1 — code review** (from `agent-governance-kit.md`, reused as-is,
  pointed at the PR diff instead of the local staged diff): quality gate.
  Produces `.claude/.pr-review-pass-<PR#>`.
- **Layer 2 — merge confirmation** (new in this kit, mirrors
  `push-gate-kit.md`'s marker mechanism exactly): authorization gate. A clean
  review is a precondition, not a substitute, for this. Produces
  `.claude/.merge-approved-<PR#>`.
- **Layer 3 — server-side branch protection**: the actual hard boundary,
  since neither of the above can be enforced by a local hook against a remote
  API call. Configured once per repo, outside the agent's control entirely —
  which is the point.

Both markers are scoped to a specific PR **and** a specific head SHA, so a new
commit on the PR invalidates both and requires fresh review + fresh
confirmation — same anti-staleness property as the other two kits' markers.
