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
if echo "$REMOTE" | grep -qE '^https://dev\.azure\.com/[^/]+/_git/'; then
  PROJECT="$REPO"
else
  PROJECT=$(echo "$REMOTE" | sed -E 's#https://dev.azure.com/[^/]+/([^/]+)/_git/.*#\1#')
fi
AUTH=$(printf ':%s' "$AZURE_DEVOPS_PAT" | base64)

PR_INFO=$(curl -sf \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/git/repositories/$REPO/pullrequests/$PR?api-version=7.1" \
  -H "Authorization: Basic $AUTH")
SRC_SHA=$(echo "$PR_INFO" | jq -r '.lastMergeSourceCommit.commitId')
DST_SHA=$(echo "$PR_INFO" | jq -r '.lastMergeTargetCommit.commitId')
git fetch origin "$SRC_SHA" "$DST_SHA" --quiet
git diff "$DST_SHA".."$SRC_SHA"
