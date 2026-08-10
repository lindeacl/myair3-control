#!/bin/bash
# Prints "github" or "azure" based on the origin remote. Exits 1 with a clear
# message for anything else.
REMOTE=$(git remote get-url origin 2>/dev/null)
if [[ "$REMOTE" == *github.com* ]]; then
  echo "github"
elif [[ "$REMOTE" == *dev.azure.com* || "$REMOTE" == *visualstudio.com* ]]; then
  echo "azure"
else
  echo "Unrecognized remote host: $REMOTE" >&2
  exit 1
fi
