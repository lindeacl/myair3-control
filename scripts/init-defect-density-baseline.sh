#!/bin/bash
# One-time bootstrap: measures CURRENT trailing defect density and writes it
# as the starting threshold — "measured reality, plus a small buffer for
# churn." Ratchet the number DOWN over time as the codebase matures; never
# raise it without a comment explaining why.
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
