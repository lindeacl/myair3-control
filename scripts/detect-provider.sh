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
