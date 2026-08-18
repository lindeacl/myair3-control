#!/bin/bash
# Counts lines of code for this project's actual shape: a single
# self-contained HTML file (markup + CSS + inline JS), not a directory of
# .ts/.js source files the upstream kit assumes. Adapted per AI Governance
# Kit's own guidance ("nothing here is meant to be copied verbatim").
#
# Usage: scripts/count-kloc.sh [file...]   (default: index.html)
set -euo pipefail
FILES=("${@:-index.html}")
EXISTING=()
for f in "${FILES[@]}"; do [ -f "$f" ] && EXISTING+=("$f"); done
if [ "${#EXISTING[@]}" -eq 0 ]; then
  echo "0"
  exit 0
fi
LINES=$(cat "${EXISTING[@]}" | grep -cve '^[[:space:]]*$' -e '^[[:space:]]*//' -e '^[[:space:]]*<!--' || true)
python3 -c "print(round(${LINES:-0} / 1000, 2))"
