#!/bin/bash
# Enforces QUALITY_STANDARD.md §5's review-size band: 200-400 changed lines
# gets 70-90% defect detection in review; above ~1,000 lines it falls to
# ~28% (SmartBear/Cisco study).
#
# Local pre-commit: WARNS only. CI: pass --enforce to hard-block above the
# 1,000-line cliff.
set -euo pipefail
ENFORCE=false
[ "${1:-}" = "--enforce" ] && ENFORCE=true

WARN_LINES=400
HARD_LINES=1000

CHANGED=$(git diff --cached --numstat 2>/dev/null | awk '{add+=$1; del+=$2} END{print add+del+0}')
[ -z "$CHANGED" ] && CHANGED=0

if [ "$CHANGED" -gt "$HARD_LINES" ]; then
  echo "❌ Diff is $CHANGED lines — over the $HARD_LINES-line cliff where review" >&2
  echo "   detection drops to ~28% (SmartBear/Cisco data, QUALITY_STANDARD.md §5)." >&2
  echo "   Split this into smaller, independently reviewable changes." >&2
  [ "$ENFORCE" = true ] && exit 1
  echo "   (local pre-commit: warning only — CI will hard-block this)" >&2
elif [ "$CHANGED" -gt "$WARN_LINES" ]; then
  echo "⚠️  Diff is $CHANGED lines — above the 200-400 line band where review" >&2
  echo "   detection is highest (70-90%, QUALITY_STANDARD.md §5). Consider splitting." >&2
else
  echo "✅ Diff size: $CHANGED lines (within the 200-400 line high-detection band, or smaller)."
fi
exit 0
