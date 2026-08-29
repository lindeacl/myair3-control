#!/bin/bash
# One-time bootstrap: measures CURRENT trailing defect density and writes it
# as the starting threshold — "measured reality, plus a small buffer for
# churn," exactly the same philosophy as the coverage policy in
# TESTING_HANDOFF §4. Ratchet the number DOWN over time as the codebase
# matures; never raise it without a comment explaining why.
set -euo pipefail
WINDOW_DAYS="${1:-90}"
mkdir -p .claude
touch .claude/defects.jsonl
echo "{\"thresholdPerKloc\": 999, \"windowDays\": $WINDOW_DAYS}" > .claude/defect-density.config.json
CURRENT=$(scripts/defect-density.sh | grep Density | grep -oE '[0-9.]+' | head -1)
STARTING=$(python3 -c "print(round(${CURRENT:-0} * 1.1, 3))")
jq --argjson t "$STARTING" '.thresholdPerKloc = $t' .claude/defect-density.config.json \
  > /tmp/ddc.json && mv /tmp/ddc.json .claude/defect-density.config.json
echo ""
echo "Baseline set: current density ≈ $CURRENT/KLOC → starting threshold $STARTING/KLOC"
echo "Edit .claude/defect-density.config.json to ratchet the threshold down over time."
echo "Target band: <10/KLOC (good commercial) within a few quarters, <1/KLOC long-run."
if [ "$(python3 -c "print(1 if ${CURRENT:-0} == 0 else 0)")" = "1" ]; then
  echo ""
  echo "⚠️  Measured density is 0 because .claude/defects.jsonl is brand new and"
  echo "   empty — this is NOT evidence the codebase has zero defects, only that"
  echo "   nothing has been logged into THIS mechanism yet. A 0.0 threshold will"
  echo "   block the first real release the moment anything gets logged. If this"
  echo "   project already has another defect-density measurement (git-history"
  echo "   fix: commits, an issue tracker export, etc.), compute a starting"
  echo "   number from THAT instead and set it by hand in"
  echo "   .claude/defect-density.config.json — don't ship the bootstrapped 0.0."
fi
