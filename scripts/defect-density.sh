#!/bin/bash
# Computes trailing defect density (defects per KLOC) and compares it to the
# ratcheted threshold in .claude/defect-density.config.json. ALWAYS prints a
# report. Exits 1 only when run with --enforce (intended for the RELEASE gate,
# NOT a per-commit/per-PR gate — see the top of DEFECT_DENSITY_KIT.md for why).
#
# --source scopes which log entries count. Defaults to "incident,prod" — the
# FIELD density QUALITY_STANDARD.md §7 calls the number that actually
# validates the process. Pass --source review or --source
# review,incident,prod for a blended/leading-indicator view (dashboards,
# trend-watching) — but never use a blended number as the release threshold;
# it dilutes field risk under a pile of expected, healthy review catches.
#
# Usage:
#   scripts/defect-density.sh                        # field density, report only
#   scripts/defect-density.sh --enforce               # field density, exit 1 if over
#   scripts/defect-density.sh --since <tag>            # window = since <tag>, not days
#   scripts/defect-density.sh --source review          # leading-indicator view only
#   scripts/defect-density.sh --source review,incident,prod   # blended (dashboard) view
set -euo pipefail
ENFORCE=false
RECORD=false
SINCE_TAG=""
SOURCE_FILTER="incident,prod"
while [ $# -gt 0 ]; do
  case "$1" in
    --enforce) ENFORCE=true; shift ;;
    --record) RECORD=true; shift ;;
    --since) SINCE_TAG="$2"; shift 2 ;;
    --source) SOURCE_FILTER="$2"; shift 2 ;;
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

# Build a jq "IN" set from the comma-separated --source list.
SOURCE_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1].split(',')))" "$SOURCE_FILTER")

DEFECT_COUNT=$(jq -sc --arg since "$SINCE_DATE" --argjson sources "$SOURCE_JSON" \
  '[.[] | select(.date >= $since) | select(.source as $s | $sources | index($s))] | length' "$LOG")
KLOC=$(scripts/count-kloc.sh)
DENSITY=$(python3 -c "print(round($DEFECT_COUNT / max($KLOC, 0.001), 3))")

echo "── Defect Density Report ──────────────────────────────"
echo "  Window:     since $SINCE_DATE"
echo "  Sources:    $SOURCE_FILTER"
echo "  Defects:    $DEFECT_COUNT"
echo "  KLOC:       $KLOC"
echo "  Density:    $DENSITY defects/KLOC"
echo "  Threshold:  $THRESHOLD defects/KLOC"
echo "─────────────────────────────────────────────────────────"
if [ "$SOURCE_FILTER" != "incident,prod" ]; then
  echo "⚠️  Non-default --source: this is a leading-indicator/dashboard view," >&2
  echo "   not the field-defect number the release gate uses by default." >&2
fi

if [ "$ENFORCE" = true ]; then
  OVER=$(python3 -c "print(1 if $DENSITY > $THRESHOLD else 0)")
  if [ "$OVER" = "1" ]; then
    echo "❌ Over threshold — release blocked. Fix defects, or if the threshold" >&2
    echo "   itself is wrong, raise it DELIBERATELY with a comment explaining why" >&2
    echo "   in .claude/defect-density.config.json — never loosen it silently" >&2
    echo "   (same ratchet discipline as the coverage policy in TESTING_HANDOFF §4)." >&2
    exit 1
  fi
  echo "✅ Within threshold."
fi

# Record this release's density into the trend history — only on a
# successful --enforce pass at a real release, so the history reflects
# release-over-release trend, not every CI run. Read by
# scripts/density-trend-audit.sh (§12/§13).
if [ "$RECORD" = true ] && [ "$ENFORCE" = true ]; then
  mkdir -p .claude
  TAG=$(git describe --tags --exact-match 2>/dev/null || echo "untagged-$(git rev-parse --short HEAD)")
  jq -nc --arg tag "$TAG" --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson density "$DENSITY" --argjson kloc "$KLOC" --argjson defects "$DEFECT_COUNT" \
    '{tag:$tag, date:$date, density:$density, kloc:$kloc, defects:$defects}' \
    >> .claude/density-history.jsonl
fi
