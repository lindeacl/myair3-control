#!/bin/bash
# Fetches a PR's diff for the reviewer to read. Usage: pr-diff.sh <pr-number>
set -euo pipefail
PR="${1:?Usage: pr-diff.sh <pr-number>}"
PROVIDER=$(./scripts/detect-provider.sh)
if [ "$PROVIDER" = "github" ]; then
  gh pr diff "$PR"
  exit 0
fi
echo "Azure DevOps path not needed for this repo (GitHub remote)." >&2
exit 1
