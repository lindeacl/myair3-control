#!/bin/bash
# Opens a PR from the current branch against the given base branch (default
# main). Requires the current branch to already be pushed.
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
: "${AZURE_DEVOPS_PAT:?Set AZURE_DEVOPS_PAT}"
echo "Azure DevOps path not needed for this repo (GitHub remote)." >&2
exit 1
