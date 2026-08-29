# Defect Density Kit — enforcing KLOC-based quality, portable across projects

A drop-in mechanism to **track, report, and gate on defect density**
(defects per thousand lines of code) as a real engineering discipline rather
than a number quoted once in a slide. Companion to `DEFECT_DISCIPLINE.md`
(the rules that reduce defects) and `TESTING_HANDOFF.md` (the coverage
ratchet this mirrors) — this kit is what turns "we should track defect
density" into something actually enforced by the repo.

**Retrofit-safe on an existing codebase — by design, not by accident.**
`scripts/init-defect-density-baseline.sh` (§4) bootstraps the release-gate
threshold at whatever the codebase's *current* trailing density actually
measures, not at zero and not at a hand-picked "good" number — same ratchet
principle `TESTING_HANDOFF.md` §4 uses for coverage. A codebase with five
years of history and a rough patch in its past starts the gate at its own
measured reality and improves from there; it is never retroactively judged
against a target it never had the chance to hit.

---

## Read this before installing: what "enforce" honestly means here

Defect density is a **trailing, aggregate** metric — defects observed over a
window, divided by codebase size. It is **not** a property of a single
commit or PR the way "tests pass" or "no exposed secret" is. A single PR
that changes 5 lines and fixes one Critical bug, and a single PR that adds
2,000 lines and fixes nothing, don't have a meaningful "density" of their
own — the ratio only means something over an aggregate.

So this kit does **not** add a hard gate that blocks every commit or PR on a
density number — that would be enforcing a metric at a grain where it's
statistically meaningless, which produces exactly the kind of gamed,
box-ticking compliance the rest of this pack is trying to avoid. Instead:

| Grain | What happens | Enforcement |
|---|---|---|
| **Every fix** (review or incident) | Logged to an append-only defect log | Mechanical (a script call) |
| **Every PR** | Density trend reported for visibility | **Informational only** — never blocks |
| **Every release/tag** | Density checked against a ratcheted threshold | **Hard gate** — blocks the release |

This is the same grain-matching principle TESTING_HANDOFF already uses for
coverage ("ratchet, don't target," §4) — applied to the metric you asked for.

---

## 1. The metric

```
Defect Density = Number of Defects / Size of Software (in KLOC)
```

- **KLOC** = thousands of lines of code, source only (no blanks, no
  comments, no generated/vendor code) — see `scripts/count-kloc.sh`.
- **Defects** = verified, fixed defects logged via `scripts/log-defect.sh`,
  each tagged with severity and **source**: `review` (caught by the
  code-reviewer before merge), `incident` (caught in an already-shipped
  release, see `INCIDENT_RESPONSE.md`), or `prod` (same as incident, used
  interchangeably depending on the project's vocabulary).
- **Window** — default trailing 90 days, or "since the last release tag"
  (`--since <tag>`) for a per-release view.

### Source segmentation — this is not optional

`QUALITY_STANDARD.md` §7 is explicit that review-defects/KLOC,
testing-defects/KLOC, and **field (post-release) defects/KLOC** are three
*different* numbers, tracked separately — field density is "the number that
actually validates the process; the others are leading indicators." Review
catches are expected to be far more numerous than field escapes (that's
review *working*), so summing all sources into one undifferentiated ratio
dilutes the one number that actually matters and makes a release look
healthier than its field track record justifies.

`scripts/defect-density.sh` therefore takes `--source` and defaults the
**release gate specifically** to field defects only (`incident,prod`) — see
§3 and §5. Use `--source review` or `--source review,incident,prod` (all)
when you want a leading-indicator or blended view for a dashboard; never use
the blended number as the release-gate threshold.

### Benchmarks (rough industry guides — set your own starting threshold from measured reality, not from this table directly)

| Quality level | Defects per KLOC |
|---|---|
| Industry average | 15–50 |
| Good commercial software | 1–10 |
| High-reliability (aerospace, medical) | < 1 |
| Six Sigma software | 0.001 |

"Enterprise grade" in this kit means: **start wherever the codebase
currently measures, ratchet toward the "good commercial" band (<10) within
the first few quarters, and treat <1 as the long-run target** — not a
day-one requirement. A threshold set below current reality on day one just
means the release gate never lets anything ship.

---

## Per-project setup checklist

1. Copy `scripts/count-kloc.sh` (step 1) — `chmod +x`. Install `cloc` for
   accurate counts (`brew install cloc` / `apt install cloc`) — the script
   falls back to a cruder count without it and says so loudly. `cloc`
   itself covers most languages (Dart included — verified via
   `cloc --show-lang`); if `cloc` genuinely isn't available, check the
   fallback path's file-extension list covers this project's language
   before trusting the number it produces.
2. Copy `scripts/log-defect.sh` (step 2) — `chmod +x`.
3. Copy `scripts/defect-density.sh` (step 3) — `chmod +x`.
4. Copy `scripts/init-defect-density-baseline.sh` (step 4) — `chmod +x`. Run
   it once to bootstrap `.claude/defect-density.config.json` at **measured
   reality** for this codebase — do not hand-pick a threshold.
5. Copy `scripts/require-release-density.sh` (step 5) — `chmod +x`. Edit the
   `RELEASE_PATTERN` regex to match this project's actual release command.
6. Merge the additional `PreToolUse` hook entry (step 6) into
   `.claude/settings.json`'s existing `"Bash"` matcher.
7. **Wire logging into the code-reviewer** (step 7) — if
   `agent-governance-kit.md` is installed, add the log-defect step to
   `.claude/agents/code-reviewer.md`'s process (shown below).
8. **Wire logging into incident response** (step 8) — see
   `INCIDENT_RESPONSE.md`'s postmortem template, which calls
   `log-defect.sh --source incident`.
9. Add a CI step (step 9) that runs `defect-density.sh` in report-only mode
   on every PR (a comment, not a check) and `--enforce --record` on
   release/tag events (the `--record` is what builds the trend history
   §13's gate reads — without it, §13 has nothing to audit).
10. Add `.claude/defects.jsonl`, `.claude/defect-density.config.json`, and
    `.claude/.density-pass-*` handling per step 10 — **the defect log itself
    is committed** (it's the audit trail), the pass-markers are gitignored.
10b. Copy `scripts/density-trend-audit.sh` and
    `scripts/require-trend-audit.sh` (§12–13) — `chmod +x` both. Merge
    `require-trend-audit.sh`'s hook entry into the same Bash matcher as
    step 6. Add `.claude/.trend-audit-override-*` to `.gitignore`.
11. Add the CLAUDE.md section (step 11).
12. Restart the agent session so the updated hooks are loaded.

Requires `jq`, `shasum`, `python3` on `PATH`. `cloc` strongly recommended.

---

## 1. `scripts/count-kloc.sh`  (portable — chmod +x)

```bash
#!/bin/bash
# Counts source lines of code (KLOC = thousands of lines), excluding blanks,
# comments, and common generated/vendor directories. Prefers `cloc` (accurate,
# comment-aware); falls back to a cruder wc-based count if cloc isn't
# installed, with a clear warning that the fallback OVERCOUNTS (it can't
# strip comments/blank lines).
#
# Usage: scripts/count-kloc.sh [root...]   (default root: src)
# Output: a single number (KLOC, e.g. "12.4") on stdout. Nothing else — safe
# to capture with $(...).
set -euo pipefail
ROOTS=("${@:-src}")
EXISTING_ROOTS=()
for r in "${ROOTS[@]}"; do [ -d "$r" ] && EXISTING_ROOTS+=("$r"); done
if [ "${#EXISTING_ROOTS[@]}" -eq 0 ]; then
  echo "0"
  exit 0
fi

if command -v cloc >/dev/null 2>&1; then
  LINES=$(cloc "${EXISTING_ROOTS[@]}" \
    --exclude-dir=node_modules,dist,build,.next,coverage,vendor,generated,.git \
    --json 2>/dev/null | jq '.SUM.code // 0')
else
  echo "⚠️  cloc not found — falling back to a cruder line count (blanks/comments" >&2
  echo "   are INCLUDED, so this OVERCOUNTS). Install cloc for accurate KLOC:" >&2
  echo "   brew install cloc  /  apt install cloc  /  choco install cloc" >&2
  # EDIT this extension list for the project's actual language(s) if not
  # covered below — cloc (the preferred path above) recognizes far more
  # languages than this fallback does; an extension missing here means
  # this project's code is silently excluded from the count, not an error.
  LINES=$(find "${EXISTING_ROOTS[@]}" -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
       -o -name '*.py' -o -name '*.go' -o -name '*.java' -o -name '*.rb' \
       -o -name '*.cs' -o -name '*.php' -o -name '*.swift' -o -name '*.kt' \
       -o -name '*.dart' -o -name '*.rs' -o -name '*.scala' -o -name '*.c' \
       -o -name '*.cpp' -o -name '*.h' -o -name '*.hpp' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*' \
    -not -path '*/.next/*' -not -path '*/coverage/*' -not -path '*/vendor/*' \
    -not -path '*/.git/*' \
    -exec cat {} + 2>/dev/null | grep -cve '^[[:space:]]*$' -e '^[[:space:]]*//' -e '^[[:space:]]*#' || true)
fi
python3 -c "print(round(${LINES:-0} / 1000, 2))"
```

---

## 2. `scripts/log-defect.sh`  (portable — chmod +x)

```bash
#!/bin/bash
# Appends one entry to the append-only defect log. Called by the
# code-reviewer agent (source=review) whenever it fixes a Critical/Warning
# before writing .review-pass, and by the incident playbook (source=incident)
# for anything caught after shipping.
#
# Usage:
#   scripts/log-defect.sh --severity Critical --class "N+1 query" \
#     --files "src/api/foo.js,src/api/bar.js" --source review [--commit <sha>]
set -euo pipefail
SEVERITY="" CLASS="" FILES="" SOURCE="" COMMIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --severity) SEVERITY="$2"; shift 2 ;;
    --class) CLASS="$2"; shift 2 ;;
    --files) FILES="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
: "${SEVERITY:?--severity required (Critical|Warning|Suggestion)}"
# NOTE: no apostrophe in this message. An unescaped `'` inside a
# `${VAR:?message}` expansion breaks bash's quote-matching even though the
# whole thing sits inside outer double quotes — caught the hard way (via
# `bash -n` failing with "unexpected EOF while looking for matching `'`",
# pointing at an unrelated later line) when a project applying this kit
# wrote "the bug's CLASS" here.
: "${CLASS:?--class required — name the bug CLASS per DEFECT_DISCIPLINE Rule 1, not just this instance}"
: "${SOURCE:?--source required (review|incident|prod)}"
if [ -z "$COMMIT" ]; then
  # NOT `$(git rev-parse HEAD 2>/dev/null || echo "unknown")` — when HEAD is
  # unresolvable (no commits yet), some git versions still print "HEAD" to
  # stdout before failing, and that partial output gets captured ALONGSIDE
  # the `|| echo` fallback inside the same $(...), producing "HEAD\nunknown"
  # instead of just "unknown" (caught in testing). Structuring the fallback
  # as a separate assignment instead of inside the substitution avoids it.
  COMMIT=$(git rev-parse HEAD 2>/dev/null) || COMMIT="unknown"
fi

mkdir -p .claude
KLOC=$(scripts/count-kloc.sh 2>/dev/null || echo "0")
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

jq -nc \
  --arg date "$DATE" --arg severity "$SEVERITY" --arg class "$CLASS" \
  --arg files "$FILES" --arg source "$SOURCE" --arg commit "$COMMIT" \
  --arg kloc "$KLOC" \
  '{date:$date, severity:$severity, class:$class, files:($files|split(",")), source:$source, commit:$commit, kloc_at_fix:($kloc|tonumber)}' \
  >> .claude/defects.jsonl

echo "Logged: $SEVERITY / $CLASS ($SOURCE) at $KLOC KLOC → .claude/defects.jsonl"
```

**Note on `--commit`:** at review time the fix is usually staged but not yet
committed, so this defaults to the *current* HEAD (the commit the fix will
land on top of) — an approximation, not forensic-grade attribution. That's
fine for a trend metric; it is not fine to rely on for "which exact commit
introduced this" — use `git blame` for that.

---

## 3. `scripts/defect-density.sh`  (portable — chmod +x)

```bash
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
SINCE_TAG=""
SOURCE_FILTER="incident,prod"
while [ $# -gt 0 ]; do
  case "$1" in
    --enforce) ENFORCE=true; shift ;;
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
```

**Why the release gate defaults to `incident,prod` and not everything:** a
codebase that reviews aggressively and catches 40 issues/KLOC in review but
ships 0.5 field defects/KLOC is *healthy* — high review-catch volume is the
system working. Blending those 40 into the release-gate denominator would
make an excellent codebase look like it's failing the threshold for the
wrong reason. Track the blended/review numbers on a dashboard for trend
visibility (§ below); gate releases on field reality only.

---

## 4. `scripts/init-defect-density-baseline.sh`  (portable — chmod +x, run once)

```bash
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
```

---

## 5. `scripts/require-release-density.sh`  (portable — chmod +x)

```bash
#!/bin/bash
# PreToolUse gate: block a release/tag command unless defect-density.sh has
# been run with --enforce (FIELD density — the default --source incident,prod,
# per QUALITY_STANDARD.md §7) and passed for the CURRENT defect log state.
# EDIT RELEASE_PATTERN below for this project's actual release command.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

RELEASE_PATTERN='(\bgit\s+tag\s+v[0-9])|(\bgh\s+release\s+create\b)|(\bnpm\s+version\b)'
echo "$COMMAND" | grep -qE "$RELEASE_PATTERN" || exit 0

LOG=".claude/defects.jsonl"
[ -f "$LOG" ] || touch "$LOG"
DEFECT_LOG_HASH=$(shasum -a 256 "$LOG" | cut -d' ' -f1)
MARKER=".claude/.density-pass-$DEFECT_LOG_HASH"

if [ ! -f "$MARKER" ]; then
  echo "Blocked: no passing defect-density check on record for the current defect log state." >&2
  echo "  Run: scripts/defect-density.sh --enforce" >&2
  echo "  Then: shasum -a 256 $LOG | cut -d' ' -f1 | xargs -I{} touch .claude/.density-pass-{}" >&2
  echo "  A new defect logged after this changes the hash and requires a fresh pass." >&2
  exit 2
fi
exit 0
```

---

## 6. `.claude/settings.json` — merge into the EXISTING `"Bash"` matcher

```json
{ "type": "command", "command": "./scripts/require-release-density.sh" }
```

---

## 7. Wire into the code-reviewer (`.claude/agents/code-reviewer.md`)

If `agent-governance-kit.md` is installed, add a step between "fix" and
"write .review-pass":

```markdown
3. Fix Critical and Warning issues directly with Edit. Do not hand them back.
3.5. For each Critical/Warning fixed, log it before writing the pass marker:
     scripts/log-defect.sh --severity <Critical|Warning> --class "<bug class>" \
       --files "<comma-separated changed files>" --source review
     Name the CLASS per DEFECT_DISCIPLINE Rule 1 — not "fixed a bug in
     foo.js" but "N+1 query," "missing tenant-scoping check," etc.
4. Re-read what you changed and confirm the fix is correct.
5. Only when zero Critical issues remain, run:
   git diff --cached | shasum -a 256 | cut -d' ' -f1 > .claude/.review-pass
```

---

## 8. Wire into incident response

See `INCIDENT_RESPONSE.md` — its postmortem template requires:

```bash
scripts/log-defect.sh --severity Critical --class "<bug class>" \
  --files "<files>" --source incident --commit <sha-that-introduced-it>
```

---

## 9. CI step (report on every PR, enforce on release)

```yaml
# report-only, every PR — visibility, never blocks. Blended view (all
# sources) is fine here — it's a dashboard signal, not a gate.
- name: Defect density report (blended, informational)
  run: scripts/defect-density.sh --source review,incident,prod

# enforcing, only on release/tag events — FIELD density only (the default),
# per QUALITY_STANDARD.md §7. Do not add --source here; the default
# (incident,prod) is the number the release gate is supposed to check.
- name: Defect density gate (field defects)
  if: startsWith(github.ref, 'refs/tags/')
  run: scripts/defect-density.sh --enforce --since ${{ github.event.before }}
```

---

## 10. What's committed vs gitignored

| File | Committed? | Why |
|---|---|---|
| `.claude/defects.jsonl` | **Yes** | It's the audit trail — the whole point is a durable, shared history of what broke and how often. |
| `.claude/defect-density.config.json` | **Yes** | The threshold is a team decision, not a local preference. |
| `.claude/.density-pass-*` | No (gitignore) | Ephemeral, same as the other kits' pass markers. |

---

## 11. CLAUDE.md section

```markdown
## Defect density policy

Every Critical/Warning the code-reviewer fixes, and every production
incident, gets logged: `scripts/log-defect.sh --severity ... --class ...
--files ... --source review|incident`. Name the bug's CLASS (see
DEFECT_DISCIPLINE.md Rule 1), not just the instance.

Defect density (`scripts/defect-density.sh`) is reported on every PR for
visibility — it never blocks a PR, only a release. Releases are gated on
**field defects only** (`--source incident,prod`, the script's default —
review catches are a leading indicator, not the release-gate number, per
QUALITY_STANDARD.md §7): `scripts/require-release-density.sh` blocks
tagging/publishing a release unless `defect-density.sh --enforce` has passed
for the current defect log. The threshold in
`.claude/defect-density.config.json` is a ratchet — lower it as the codebase
matures, never raise it without a comment explaining why.

Releases are ALSO gated on trend: `scripts/require-trend-audit.sh` blocks a
release if density isn't trending toward target over the last 3 releases
(`scripts/density-trend-audit.sh`), unless a written override — an actual
reason, not just "ok" — is on record at
`.claude/.trend-audit-override-<hash-of-density-history.jsonl>`. If you hit
this block: run `scripts/density-trend-audit.sh` yourself, read the output,
and ask the user whether to proceed and why — don't write a placeholder
override just to get past the gate.
```

---

## 12. `scripts/density-trend-audit.sh`  (portable — chmod +x)

`QUALITY_STANDARD.md` §7 says: "if field defect density isn't trending
toward target after a few release cycles, the fix isn't 'try harder' — audit
which of Sections 1–6 is actually being followed versus just documented."
That was a sentence with no mechanism behind it. This is the mechanism —
it requires a **history** of density-at-release, which `defect-density.sh`
now records via `--record` at each release gate.

```bash
#!/bin/bash
# Compares the last N release-density snapshots and flags stagnation or
# regression — the automated version of QUALITY_STANDARD.md §7's "audit
# which section isn't being followed" trigger. Run manually, or wire into
# a periodic CI job (monthly is reasonable — this is a slow-moving trend,
# not a per-release gate). Pass --enforce to make this script exit 1 on a
# confirmed regression, for use by scripts/require-trend-audit.sh (§13) —
# without --enforce it always exits 0, same convention as defect-density.sh.
#
# Usage: scripts/density-trend-audit.sh [n-releases] [--enforce]
set -euo pipefail
N=3
ENFORCE=false
for arg in "$@"; do
  case "$arg" in
    --enforce) ENFORCE=true ;;
    *) N="$arg" ;;
  esac
done
HISTORY=".claude/density-history.jsonl"

if [ ! -f "$HISTORY" ] || [ "$(wc -l < "$HISTORY" | tr -d ' ')" -lt "$N" ]; then
  COUNT=$( [ -f "$HISTORY" ] && wc -l < "$HISTORY" | tr -d ' ' || echo 0)
  echo "Not enough history yet ($COUNT/$N releases recorded) — nothing to audit."
  echo "History accumulates automatically each time defect-density.sh --record runs at a release."
  exit 0
fi

RECENT=$(tail -n "$N" "$HISTORY")
echo "── Density Trend (last $N releases) ────────────────────"
echo "$RECENT" | jq -r '"  \(.tag)  \(.date)  \(.density) defects/KLOC"'
echo "───────────────────────────────────────────────────────────"

# Trend check: is the most recent density <= the oldest of the N window?
# (a coarse "not getting worse" check — not a strict monotonic requirement,
# since a single release can blip up on a small KLOC denominator; the
# question that matters is the WINDOW's direction, not every single step)
FIRST=$(echo "$RECENT" | head -1 | jq -r '.density')
LAST=$(echo "$RECENT" | tail -1 | jq -r '.density')
IMPROVING=$(python3 -c "print(1 if $LAST <= $FIRST else 0)")

if [ "$IMPROVING" = "1" ]; then
  echo "✅ Trending flat or down over the last $N releases ($FIRST → $LAST)."
  exit 0
fi

echo "⚠️  NOT trending toward target: $FIRST → $LAST over the last $N releases." >&2
echo "" >&2
echo "Per QUALITY_STANDARD.md §7: this is not a 'try harder' problem — audit" >&2
echo "which of Sections 1-6 is actually being followed vs. just documented:" >&2
echo "  §1 Spec before code       — are specs actually written, or skipped under deadline?" >&2
echo "  §2 Coding standard        — is the linter catching real violations or is it loosened?" >&2
echo "  §3 Test discipline        — check MUTATION_TESTING.md's score trend alongside this one" >&2
echo "  §4 Deterministic gates    — audit whether --no-verify / bypass usage has crept up" >&2
echo "  §5 Independent review     — check review-size distribution (git log diff stats) —" >&2
echo "                              are diffs drifting above the 200-400 line band?" >&2
echo "  §6 Defect feedback loop   — pull recent defects.jsonl entries and check whether" >&2
echo "                              'class' enumeration (Rule 1) is actually happening or" >&2
echo "                              entries just restate the instance" >&2

[ "$ENFORCE" = true ] && exit 1
exit 0
```

**Recording history — add `--record` to the release-gate CI step** (§9, the
enforcing job — not the informational per-PR one):

```bash
# CI_TEMPLATES.md's defect-density job, release-tag branch — replace:
#   run: ./scripts/defect-density.sh --enforce
# with:
#   run: ./scripts/defect-density.sh --enforce --record
```

`--record` appends one line to `.claude/density-history.jsonl`
(`{"tag":..., "date":..., "density":..., "kloc":..., "defects":...}`) after
a successful `--enforce` pass — only on releases that actually shipped, so
the history reflects real release-over-release trend, not every CI run.

Add this to `defect-density.sh`'s argument parsing (alongside `--enforce`,
`--since`, `--source`):

```bash
# In the arg-parsing while-loop, add:
    --record) RECORD=true; shift ;;
# ...and after a successful --enforce pass, before the final "Within threshold":
if [ "$RECORD" = true ] && [ "$ENFORCE" = true ]; then
  mkdir -p .claude
  TAG=$(git describe --tags --exact-match 2>/dev/null || echo "untagged-$(git rev-parse --short HEAD)")
  jq -nc --arg tag "$TAG" --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson density "$DENSITY" --argjson kloc "$KLOC" --argjson defects "$DEFECT_COUNT" \
    '{tag:$tag, date:$date, density:$density, kloc:$kloc, defects:$defects}' \
    >> .claude/density-history.jsonl
fi
```

`.claude/density-history.jsonl` is **committed**, same as `defects.jsonl` —
it's the audit trail the trend check reads, not ephemeral state.

---

## 13. `scripts/require-trend-audit.sh`  (portable — chmod +x)

Closes the gap the trend-audit had on its own: printing a report nobody is
required to read. This is a release gate, same shape as
`require-release-density.sh` (§5) — but the happy path is **frictionless**:
if the trend is fine, it passes automatically with no marker to write at
all. Only a **confirmed regression** requires a human-authored override —
and that override must contain an actual written reason, not just an "ok"
token, the same way a threshold in `.claude/defect-density.config.json` can
only be raised with a comment explaining why.

```bash
#!/bin/bash
# PreToolUse gate: block a release/tag command unless the density trend
# audit passes, OR — if it's regressing — a written override with a real
# reason is on record for the CURRENT history-file state.
# EDIT RELEASE_PATTERN to match this project's actual release command
# (should match require-release-density.sh's pattern).
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

RELEASE_PATTERN='(\bgit\s+tag\s+v[0-9])|(\bgh\s+release\s+create\b)|(\bnpm\s+version\b)'
echo "$COMMAND" | grep -qE "$RELEASE_PATTERN" || exit 0

HISTORY=".claude/density-history.jsonl"
[ -f "$HISTORY" ] || exit 0   # no history yet — nothing to audit, same as the underlying script

if scripts/density-trend-audit.sh --enforce >/tmp/trend-audit-output.$$ 2>&1; then
  rm -f /tmp/trend-audit-output.$$
  exit 0   # improving/flat/not-enough-history — frictionless pass, no marker needed
fi

# Regressing: require a written override, keyed to the CURRENT history file
# content — a new release snapshot changes the hash and invalidates any
# prior override, so an old justification can never silently cover a new
# regression.
HISTORY_HASH=$(shasum -a 256 "$HISTORY" | cut -d' ' -f1)
OVERRIDE=".claude/.trend-audit-override-$HISTORY_HASH"

if [ ! -s "$OVERRIDE" ]; then
  echo "Blocked: defect density is NOT trending toward target (see below) and no" >&2
  echo "override with a stated reason is on record for the current history state." >&2
  cat /tmp/trend-audit-output.$$ >&2
  rm -f /tmp/trend-audit-output.$$
  echo "" >&2
  echo "Ask the user whether to proceed despite the regression. If yes, write the" >&2
  echo "ACTUAL REASON (not just 'ok') to:" >&2
  echo "  $OVERRIDE" >&2
  echo "e.g.: echo 'Known regression — root cause is the Q3 vendor migration," >&2
  echo "tracked in ADR-0042, fix scheduled for next release.' > $OVERRIDE" >&2
  exit 2
fi
rm -f /tmp/trend-audit-output.$$
echo "⚠️  Releasing despite a density-trend regression — override on record:" >&2
cat "$OVERRIDE" >&2
exit 0
```

**Wire into `.claude/settings.json`** — merge into the same Bash matcher as
`require-release-density.sh`:

```json
{ "type": "command", "command": "./scripts/require-trend-audit.sh" }
```

**Add to `.gitignore`:** `.claude/.trend-audit-override-*` — same as the
other pass-markers, ephemeral per-history-state, not committed.

**What this does and doesn't fix:** it makes the trend-audit's output
impossible to silently ignore — a regression genuinely blocks the release
until someone writes down why they're proceeding anyway. It does **not**
prevent someone from writing a low-effort, non-substantive override to get
past it — that residual is the same one every gate requiring human
judgment has (code review has the identical shape: a marker proves review
*happened*, not that it was thorough). What changed is the null case: doing
nothing is no longer an option. Before this gate, a regressing trend could
go unread indefinitely; now it cannot.

---

## How it fits together (three grains, one metric)

- **Fix-time (every review/incident):** mechanical logging via
  `log-defect.sh` — cheap, always-on, feeds everything downstream.
- **PR-time:** `defect-density.sh` report-only — visibility without
  meaningless per-commit blocking.
- **Release-time:** `require-release-density.sh` + `defect-density.sh
  --enforce` — the actual hard gate, at the grain where the metric is
  statistically meaningful.

Same anti-gaming property as the coverage ratchet: the threshold can only be
raised with a visible, reviewed comment explaining why — silently loosening
it defeats the entire point of tracking it.
