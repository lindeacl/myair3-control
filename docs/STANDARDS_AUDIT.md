# Standards Audit — a portable conformance-check prompt

# ─────────────────────────────────────────────────────────────

# Run this against a codebase to check conformance with

# CODE_STANDARDS.md. Findings only — no fixes in this phase.

# Pair with: CODE_STANDARDS.md (this pack's ruleset)

# ─────────────────────────────────────────────────────────────

---

## INSTRUCTIONS FOR THE AGENT

- Load `CODE_STANDARDS.md` (this project's filled-in copy, per that
  file's own Section 0) as your reference ruleset before starting.
- Scan the codebase against every section in `CODE_STANDARDS.md`.
- Do NOT attempt fixes — findings and verdicts only. If this project has
  its own remediation-tracking doc or process, feed ❌ Fail items into
  that instead of fixing inline here.
- Flag all assumptions with ⚠️ ASSUMPTION: [detail]
- This prompt is self-contained — ignore all prior chat context.
- Produce one unified conformance report at the end.

---

## FILL IN BEFORE RUNNING

```
Entry point:      [ EDIT — e.g. src/app/layout.tsx, main.py, cmd/server/main.go ]
Ignore paths:     [ EDIT — e.g. /node_modules, /dist, *.mock.*, *.spec.* ]
Standards file:   CODE_STANDARDS.md
Focus sections:   [ EDIT — All, or a subset per the run-schedule table below ]
```

---

## VERDICT CLASSIFICATION

```
✅ Pass      — fully conforms to the standard
⚠️  Warn      — partially conforms, improvement needed
❌ Fail      — does not conform, action required
⏭️  Skip      — not applicable to this stack or project
```

Use `⏭️ Skip`, not `❌ Fail`, for a `CODE_STANDARDS.md` section marked
`[STACK-SPECIFIC]` or frontend-only that genuinely doesn't apply to this
project (e.g. Section 10 — Accessibility, for a backend-only service).
A rule that can't apply isn't a violation.

---

## AUDIT TASKS — RUN IN SEQUENCE

### SECTION 1 — FILE & FOLDER STRUCTURE

Check:

1. Are folders organised by feature/domain rather than file type?
2. Are files named to match their primary export?
3. Are any files or functions over the stated size limits?
4. Are test files co-located with source files?
5. Are config files properly grouped?
6. Are there any orphaned, generic-named, or misplaced files?

**OUTPUT PER FINDING**

```
📄 Location: [path]
🏷️  Section: 1 — File & Folder Structure
Rule: [which rule from CODE_STANDARDS.md]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 2 — NAMING CONVENTIONS

Check:

1. Do all variables and functions follow the naming convention?
2. Are booleans prefixed (is/has/can/should)?
3. Are functions verb-noun?
4. Are constants UPPER_SNAKE_CASE?
5. Are there magic numbers or strings not extracted to named constants?
6. Are there any abbreviations that are non-standard?

**OUTPUT PER FINDING**

```
📄 File: [path + line number]
🏷️  Section: 2 — Naming Conventions
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Found: [actual name used]
Expected: [what it should be]
```

---

### SECTION 3 — CODE QUALITY

Check:

1. Do functions do more than one thing?
2. Do any functions have more than 4 parameters?
3. Is there deeply nested code (>3 levels)?
4. Is there commented-out code?
5. Are there unhandled operations that can fail?
6. Are errors silently swallowed?
7. Are there blocks of 10+ lines duplicated across files?
8. Are there unused imports?
9. Are there circular dependencies?

**OUTPUT PER FINDING**

```
📄 File: [path + line number]
🏷️  Section: 3 — Code Quality
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 4 — COMPONENT / MODULE DESIGN

Skip this section entirely (⏭️) for a backend-only or CLI project — see
`CODE_STANDARDS.md` §4's note.

Check:

1. Do UI components contain business logic?
2. Is data fetching mixed with presentation?
3. Do components follow the defined internal structure order?
4. Is there prop drilling beyond 2 levels?
5. Is state normalised or duplicated across stores?
6. Are inline styles used where they shouldn't be?

**OUTPUT PER FINDING**

```
📄 Component: [path + line number]
🏷️  Section: 4 — Component / Module Design
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 5 — API & DATA LAYER

Check:

1. Do endpoints follow consistent naming conventions?
2. Are HTTP verbs used correctly?
3. Do all responses follow the defined shape?
4. Are all inputs validated at the API boundary?
5. Are DTOs used — raw DB models not exposed?
6. Are all queries parameterised — no string concatenation?
7. Are migrations version-controlled?
8. Do all foreign keys and filter columns have indexes?
9. If this project is multi-tenant: is the tenant/org identifier scoped
   on every query? Treat a miss here as ❌ Fail at Critical severity,
   not a style nit (see `CODE_STANDARDS.md` §5.2).

**OUTPUT PER FINDING**

```
📄 File / Endpoint: [path + route]
🏷️  Section: 5 — API & Data Layer
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 6 — TESTING STANDARDS

For the deeper question of whether the tests that exist actually catch
bugs — not just whether they're present — run `TEST_EFFECTIVENESS_AUDIT.md`
separately; this section checks presence and basic quality only.

Check:

1. Do utility functions and business logic have unit tests?
2. Do all API endpoints have integration tests?
3. Do all interactive UI elements have component tests?
4. Do tests follow AAA pattern?
5. Are there tests that only test implementation detail?
6. Are test descriptions human-readable sentences?
7. Are there skipped or commented-out tests?
8. Is coverage meeting the defined threshold?

**OUTPUT PER FINDING**

```
📄 File: [path]
🏷️  Section: 6 — Testing Standards
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 7 — DOCUMENTATION

Check:

1. Do all public functions have doc comments (JSDoc/docstring/godoc/etc.)?
2. Does README.md exist and contain setup, env vars, run commands?
3. Does CONTRIBUTING.md exist?
4. Is the API documented?
5. Is a CHANGELOG maintained?
6. Are there obvious comments that just restate the code?

**OUTPUT PER FINDING**

```
📄 File: [path]
🏷️  Section: 7 — Documentation
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 8 — GIT & VERSION CONTROL

Check (inspect recent commit history and PR descriptions):

1. Do recent commits follow the project's commit convention?
2. Are PRs under the stated line-change limit?
3. Do PRs have meaningful descriptions?
4. Does `.gitignore` cover this project's actual build/dependency
   artefacts?
5. Are any binary files or build artefacts committed?

**OUTPUT PER FINDING**

```
📄 Location: [file or commit ref]
🏷️  Section: 8 — Git & Version Control
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 9 — CONFIGURATION & ENVIRONMENT

Check:

1. Is all config coming from environment variables?
2. Does `.env.example` exist with all required keys?
3. Are secrets absent from the codebase?
4. Is linter config committed?
5. Is formatter config committed?
6. Are pre-commit hooks configured?

**OUTPUT PER FINDING**

```
📄 File: [path]
🏷️  Section: 9 — Config & Environment
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

### SECTION 10 — ACCESSIBILITY (FRONTEND)

Skip this section entirely (⏭️) for a backend-only or CLI project.

Check:

1. Do all images have meaningful alt attributes?
2. Are all interactive elements keyboard navigable?
3. Do all icon-only buttons have ARIA labels?
4. Do all form inputs have associated labels?
5. Are focus indicators visible?
6. Does content rely on colour alone anywhere?

**OUTPUT PER FINDING**

```
📄 Component: [path + line number]
🏷️  Section: 10 — Accessibility
Rule: [which rule]
Verdict: [✅ / ⚠️ / ❌]
Detail: [what was found]
Fix: [what needs to change]
```

---

## UNIFIED CONFORMANCE REPORT

_Output this section last, after all sections are complete._

### SECTION SCORECARD

```
Section                            ✅ Pass   ⚠️ Warn   ❌ Fail   ⏭️ Skip   Score
──────────────────────────────────────────────────────────────────────────────
1 — File & Folder Structure
2 — Naming Conventions
3 — Code Quality
4 — Component / Module Design
5 — API & Data Layer
6 — Testing Standards
7 — Documentation
8 — Git & Version Control
9 — Config & Environment
10 — Accessibility
──────────────────────────────────────────────────────────────────────────────
TOTAL
```

### OVERALL GRADE

```
Pass rate:   [X]% of applicable rules passing (⏭️ Skip items excluded
             from the denominator — see the verdict-classification note
             above)

Grade:
  90–100%  → ✅ A — Maintain
  75–89%   → 🟡 B — Schedule improvements
  60–74%   → 🟠 C — Prioritise refactor sprint
  Below 60% → 🔴 D — Immediate action required
```

### TOP 10 VIOLATIONS (highest priority across all sections)

```
Priority  Section  File:Line  Rule  Fix
────────────────────────────────────────────────────────
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
```

### PATTERNS & SYSTEMIC ISSUES

```
[List recurring violations that suggest a team habit or
 missing tooling rather than one-off mistakes]

Examples:
  - "Functions consistently exceed 50 lines — suggests missing
    extraction habit or no linter rule enforcing this"
  - "No tests for utility functions — suggests test coverage
    threshold not enforced in CI"
```

### MISSING TOOLING (gaps that automation could prevent)

```
Missing linter rules:    [list]
Missing pre-commit hook: [list]
Missing CI checks:       [list]
Missing documentation:   [list]
```

### QUICK WINS (can be fixed in under 30 minutes)

```
[List ❌ Fail items that are simple to resolve:
 rename a file, add a missing .gitignore entry,
 add a missing alt attribute, etc.]
```

### NEXT STEPS

```
Immediate (this sprint):
  → [list top 3 critical failures]

Short term (next sprint):
  → [list systemic issues to address]

Tooling to add:
  → [list missing automation]

→ If this project logs defects via DEFECT_DENSITY_KIT.md, log any
  ❌ Fail item that represents a real historical defect class with
  scripts/log-defect.sh --source review, so it feeds the same
  field-defect tracking the rest of this pack uses.
```

---

## WHEN TO RUN THIS AUDIT

| Trigger                      | Sections to run   |
| ----------------------------- | ------------------ |
| New developer onboarding     | All sections      |
| Start of each sprint         | Sections 1–4, 8–9 |
| Before major release         | All sections      |
| After large refactor         | Sections 1–5      |
| After new dependencies added | Sections 3, 9     |
| Quarterly code health review | All sections      |

---

## How this fits with the rest of the pack

- Pure conformance check against `CODE_STANDARDS.md` — same
  relationship as `require-review.sh` has to `agent-governance-kit.md`'s
  checklist, except this one is a periodic audit, not a per-commit gate.
- Feeds `DEFECT_DENSITY_KIT.md` if this project logs defects that way
  (see "Next Steps" above) — a recurring ❌ Fail pattern here is exactly
  the kind of systemic issue `DEFECT_DENSITY_KIT.md`'s trend audit is
  meant to surface at the release-gate grain.
- Complements, not duplicates, `TEST_EFFECTIVENESS_AUDIT.md` — Section 6
  here checks whether tests *exist* and follow basic quality
  conventions; that file checks whether they actually *catch bugs*.

---

_STANDARDS_AUDIT.md — conformance check only, no fixes. Part of the AI
Governance Kit. Pair with: CODE_STANDARDS.md (ruleset)._
