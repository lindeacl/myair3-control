#!/bin/bash
# Computes trailing defect density (defects per KLOC) and compares it to the
# ratcheted threshold in .claude/defect-density.config.json. ALWAYS prints a
# report. Exits 1 only when run with --enforce (intended for the RELEASE gate,
# NOT a per-commit/per-PR gate).
set -euo pipefail
ENFORCE=false
SINCE_TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --enforce) ENFORCE=true; shift ;;
    --since) SINCE_TAG="$2"; shift 2 ;;
    *) shift ;;
  esac
done

CONFIG=".claude/defect-density.config.json"
if [ ! -f "$CONFIG" ]; then
  echo "No $CONFIG found — run scripts/init-defect-density-baseline.sh first." >&2
  exit 1
fi
THRESHOLD=$(jq -r '.thresholdPerKloc' "$CONFIG")
WINDOW_DAYS=$(jq -r '.windowDays // 90' "$CONFIG")
LOG=".claude/defects.jsonl"
[ -f "$LOG" ] || touch "$LOG"

if [ -n "$SINCE_TAG" ]; then
  SINCE_DATE=$(git log -1 --format=%aI "$SINCE_TAG" 2>/dev/null || echo "1970-01-01T00:00:00Z")
else
  SINCE_DATE=$(date -u -v-"${WINDOW_DAYS}"d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || date -u -d "${WINDOW_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
fi

DEFECT_COUNT=$(jq -sc --arg since "$SINCE_DATE" '[.[] | select(.date >= $since)] | length' "$LOG")
KLOC=$(scripts/count-kloc.sh)
DENSITY=$(python3 -c "print(round($DEFECT_COUNT / max($KLOC, 0.001), 3))")

echo "── Defect Density Report ──────────────────────────────"
echo "  Window:     since $SINCE_DATE"
echo "  Defects:    $DEFECT_COUNT"
echo "  KLOC:       $KLOC"
echo "  Density:    $DENSITY defects/KLOC"
echo "  Threshold:  $THRESHOLD defects/KLOC"
echo "─────────────────────────────────────────────────────────"

if [ "$ENFORCE" = true ]; then
  OVER=$(python3 -c "print(1 if $DENSITY > $THRESHOLD else 0)")
  if [ "$OVER" = "1" ]; then
    echo "❌ Over threshold — release blocked. Fix defects, or if the threshold" >&2
    echo "   itself is wrong, raise it DELIBERATELY with a comment explaining why" >&2
    echo "   in .claude/defect-density.config.json — never loosen it silently." >&2
    exit 1
  fi
  echo "✅ Within threshold."
fi
