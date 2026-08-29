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

: "${AZURE_DEVOPS_PAT:?Set AZURE_DEVOPS_PAT (scopes: Code R/W, PR Threads R/W)}"
REMOTE=$(git remote get-url origin)
ORG=$(echo "$REMOTE" | sed -E 's#https://dev.azure.com/([^/]+)/.*#\1#')
REPO=$(basename "$REMOTE")
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
