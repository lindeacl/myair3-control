# Code Standards — a portable reference ruleset

# ─────────────────────────────────────────────────────────────

# This file defines the standards a codebase is measured against.

# Pair with: STANDARDS_AUDIT.md (conformance check) and, for the

# testing section specifically, TEST_EFFECTIVENESS_AUDIT.md.

# ─────────────────────────────────────────────────────────────

**This is a template, not a finished standard.** Every checklist item
below is a real, defensible rule distilled from a production TypeScript/
Next.js/Prisma service — one example stack, not a requirement (same
"swap-ins, not a mandate" framing as `TESTING_HANDOFF.md`). Section 0
below is a **fill-in-the-blanks block**, not a fixed configuration —
replace every value with this project's actual stack before using the
rest of the document; several checklist items further down name a
specific tool (Prisma, Vitest, tsc) as their worked example and are
marked `[STACK-SPECIFIC]` where they need retargeting for a different
stack, the same way `CI_TEMPLATES.md` marks its Node-specific steps
`# EDIT:`.

**Retrofit-safe:** every ratchet-style rule here (file size, coverage,
etc.) bootstraps at *this codebase's own measured reality*, never an
arbitrary target — same principle as `TESTING_HANDOFF.md` §4's coverage
ratchet and `DEFECT_DENSITY_KIT.md`'s baseline bootstrap. Don't adopt
this file by declaring violations non-compliant on day one; measure
first, grandfather what already exists, and only ratchet forward from
there (see §1.3 for the worked pattern).

---

## SECTION 0 — PROJECT CONFIGURATION

**Fill this in for the actual project before using the rest of this
file — do not leave the example values below in place.** Sections 5
(API & Data Layer) and 6 (Testing) in particular assume whatever's
filled in here; skip or rewrite the sub-checks that don't apply to this
project's real stack rather than forcing them to fit.

```
Stack:
  Language:         JavaScript (ES2020+), vanilla — no TypeScript
  Runtime:          Browser (any modern evergreen browser) for the app itself;
                     Node.js 22 for tooling/CI (actions/setup-node@v4); a
                     small Python 3 stdlib server (server.py) for local
                     dev/LAN hosting + same-origin proxy to the physical
                     controller
  Framework:        None — single-file vanilla JS/HTML/CSS PWA (index.html),
                     no bundler, no component framework (React/Vue/etc. do
                     not apply — see Section 4.2-4.3 note below)
  Test framework:   Playwright (@playwright/test ^1.48.0) — E2E only. No
                     unit-test layer: nothing is isolable to unit-test in a
                     single-file, bundler-free app (see CLAUDE.md); real V8
                     execution coverage of index.html's inline script is
                     measured during the E2E run instead
                     (scripts/check-coverage.mjs)
  Linter:           None installed (no eslint/tsc — no TS, no bundler by
                     design). Mechanical equivalent: scripts/check-html-js.mjs
                     (parses every embedded <script> block, checks for
                     duplicate static ids)
  Formatter:        prettier (`.prettierrc.json`: 2-space indent, single
                     quotes — matches this project's existing JS style),
                     wired into `.husky/pre-commit` and CI
                     (`npm run format:check`). Scoped to `**/*.{js,mjs}`
                     only — `index.html` is deliberately excluded for now
                     (see `.prettierignore`): prettier's HTML formatter
                     reformats the whole file (~4,300-line diff on this
                     1,660-line file, measured by actually running it),
                     which would swamp real changes under whitespace
                     churn. Formatting index.html is a real follow-up, just
                     not bundled into unrelated changes.
  Package manager:  npm (package-lock.json committed)
  Monorepo?         No — single package.json at repo root (a sibling
                     ../ios-app Capacitor wrapper exists outside this repo
                     and is not part of this package)

Conventions in use:
  Naming convention:  camelCase for JS functions/variables (e.g.
                       loadConnSettings, fetchWithTimeout, describeFetchError);
                       kebab-case for script/file names (check-html-js.mjs,
                       require-push-approval.sh)
  Branch strategy:    Trunk-based — short-lived feature branches
                       (agent/<short-slug>) merged to branch-protected `main`
                       via PR (see pr-workflow-kit.md); no GitFlow
                       develop/release branches
  Commit convention:  Plain imperative descriptive titles referencing the PR
                       number (e.g. "Add real Settings screen with the app's
                       first screen navigation (#10)") — not Conventional
                       Commits (no feat:/fix:/chore: prefixes in history)
  API style:          REST-ish, but not this project's own design — same-
                       origin fetch() calls proxied by server.py to the
                       physical Advantage Air controller's own HTTP/XML API
                       (third-party device firmware, not a JSON API this
                       project controls)
  CSS approach:       Inline <style> block within index.html — no CSS-in-JS,
                       no preprocessor, no separate stylesheet/framework
  ORM / data layer:   [ EDIT — N/A, genuinely does not apply. No database,
                       no server-side data layer at all. Client-side
                       persistence is localStorage only (connection
                       settings, zone names/temps, UI prefs) ]
  Auth:                [ EDIT — no conventional user auth. A single shared
                       device password (entered in Settings, stored in
                       localStorage) is passed as a query param to the
                       physical controller's own HTTP API. No accounts,
                       sessions, or tokens to design/audit beyond not
                       leaking that password ]
  Deployment:          [ EDIT — no hosted deployment. Locally run: server.py
                       serves the app on the LAN; a separate Capacitor iOS
                       wrapper (sibling ../ios-app, outside this repo)
                       provides a native shell. Not deployed to any cloud
                       host, CDN, or GitHub Pages today ]

Team size:
  Developers:           1 (solo maintainer — personal project, not an
                         enterprise/team codebase; see CLAUDE.md)
  Maintainer experience: [ EDIT — N/A, no team to characterize. Treat any
                         "team size" checks elsewhere in this document
                         (e.g. review-sizing rationale in §5/8.2) as
                         informational context — the actual review
                         mechanism here is an independent LLM subagent
                         (code-reviewer), not a human reviewer pool ]
```

---

## SECTION 1 — FILE & FOLDER STRUCTURE

### 1.1 Folder Organisation

- [ ] Folders are organised by feature/domain, not by file type
      GOOD: /features/auth/ /features/payments/
      BAD: /controllers/ /models/ /helpers/
- [ ] No file is more than 3 levels deep from its feature root
- [ ] Shared utilities live in /shared or /common — not scattered
- [ ] No orphaned files at root level except config files
- [ ] Entry points are clearly named (index.ts / main.ts / app.ts)

### 1.2 File Naming

- [ ] File names match the primary export they contain
- [ ] File names follow the project naming convention (see Section 0)
- [ ] No generic names: utils.ts / helpers.js / misc.ts / stuff.ts
- [ ] Test files co-located with source: component.test.ts next to component.ts
- [ ] Config files grouped: all env/config at project root or /config

### 1.3 File Size

- [ ] No file exceeds **300 lines for scripts/tests; index.html is
      grandfathered at its current ~1,660 lines** — **enforced as a
      ratchet**, not a blanket rule. [ EDIT NOTE: this project is
      deliberately a single-file app (index.html) by design, not an
      oversight — see CLAUDE.md. A per-file cap doesn't fit that
      architecture the way it would a multi-file codebase, so this is
      applied only to the *other* real files here (scripts/*.sh,
      scripts/*.mjs, e2e/*.js — all currently under 300 lines except
      e2e/aircon-control.spec.js at ~603 lines, itself grandfathered at
      that measured size). No mechanical enforcement script exists yet
      for this ratchet (unlike check-diff-size.sh for PR size) — adding
      one is a real gap, not silently assumed done. ] This is the pattern to actually
      follow, not a fixed number to copy: measure this codebase's real
      file-size distribution first (a one-line `wc -l` sweep), pick a
      limit, then write a small script (same shape as
      `agent-governance-kit.md`'s `scripts/check-diff-size.sh`) that
      blocks any NEW file over the limit and blocks any pre-existing
      violator from growing further, wired into the pre-commit hook.
      **Grandfather every pre-existing violator explicitly** — list them
      in the script with their line count at grandfathering time; they
      may shrink or hold, never grow. Stating an absolute limit
      ("no file exceeds N lines") while real files silently violate it
      is worse than a documented, enforced ratchet — an unenforced rule
      that contradicts the code is itself the bug
      (`DEFECT_DISCIPLINE.md` Rule 6 applies to standards docs, not just
      code).
- [ ] No function exceeds 50 lines (flag for extraction)
- [ ] No class exceeds 200 lines (flag for splitting)

---

## SECTION 2 — NAMING CONVENTIONS

### 2.1 Variables & Functions

- [ ] Names are descriptive — no single letters except loop counters
- [ ] Booleans are prefixed: isLoading / hasError / canEdit / shouldRetry
- [ ] Functions are verb-noun: getUser / createPayment / validateEmail
- [ ] No abbreviations unless universally known (id, url, api, db)
- [ ] No magic numbers — all constants are named and declared

### 2.2 Components & Classes

- [ ] Components / classes use the project's convention for type names
      (commonly PascalCase)
- [ ] No God objects — classes have a single clear responsibility
- [ ] Function/method signatures are explicitly typed where the language
      supports it — no untyped/`any`-equivalent escape hatches by default
- [ ] Event handlers prefixed: handleSubmit / handleClick / onClose
      (frontend-specific — skip for a backend-only project)
      **[ EDIT NOTE for this project]: NOT the actual convention here —
      see below.**

**This project's real convention, documented instead of left in
disagreement with the code:** `index.html` consistently uses anonymous
inline arrow-function listeners for simple, one-off UI wiring (15+ call
sites — `document.getElementById('settings-open').addEventListener('click',
() => {...})`, the `.cmd`/`.data` delegated click handlers, the
`live-poll-toggle` change handler, etc.), not named `handleX`/`onX`
functions. This is a deliberate, internally-consistent house style, not an
oversight — refactoring 15+ call sites into named handlers for a project
this size would be churn/risk with no real readability gain (each listener
is a few lines, attached once, next to the element it wires). Multi-step or
reused logic already IS a named function regardless of whether it's wired
as a listener (`refreshState`, `sendCommand`, `openZoneDetail`,
`handleCommandSuccess`, `handleCommandFailure`, etc.) — the
anonymous-inline pattern is specifically for simple, single-purpose
listener bodies. Leaving the checklist item above stating the opposite of
actual practice would be exactly the "unenforced/wrong rule is worse than
an honest one" failure this file warns against elsewhere (see §1.3's
grandfathered file-size ratchet for the same reasoning applied to a
different rule).

### 2.3 Constants & Enums

- [ ] Constants are UPPER_SNAKE_CASE
- [ ] Enums / string literals follow the project's naming convention
- [ ] No inline magic strings — all repeated strings extracted to constants

---

## SECTION 3 — CODE QUALITY

### 3.1 Functions

- [ ] Each function does ONE thing (Single Responsibility)
- [ ] Functions have no more than 3–4 parameters
      (use an options object / struct / kwargs if more are needed)
- [ ] No deeply nested code — max 3 levels of nesting
- [ ] No commented-out code committed to main/master
- [ ] No TODO / FIXME comments older than one sprint

### 3.2 Error Handling

- [ ] All operations that can fail have error handling appropriate to
      the language (try/catch, `Result`/`Either`, explicit error return
      values, etc.)
- [ ] Errors are never silently swallowed
- [ ] Error messages are descriptive and actionable
- [ ] User-facing errors do not expose internal details
- [ ] Error boundaries/handlers exist at meaningful component/service
      levels

### 3.3 Code Duplication

- [ ] No block of 10+ lines duplicated across files
- [ ] Shared logic extracted to utilities or hooks
- [ ] No copy-paste variations of the same function

### 3.4 Dependencies

- [ ] No unused imports
- [ ] No circular dependencies between modules
- [ ] External dependencies imported from a single barrel file per module
      (where the language/ecosystem supports this pattern)
- [ ] No direct deep imports from third-party packages' internals
      BAD: import x from 'library/internal/deep/path'
      GOOD: import x from 'library'

---

## SECTION 4 — COMPONENT / MODULE DESIGN

*Sections 4.2–4.3 are frontend-specific — skip them for a backend-only
or CLI project.*

**[ EDIT NOTE for this project]:** this IS a frontend (a PWA), so 4.2-4.3
are not skipped as "backend-only" — but there is genuinely no component
framework (no React/Vue/etc; no `props`, no component tree) to apply
4.2's "component internal order" or 4.3's "prop drilling" checks to
literally. Read both as their nearest DOM-manipulation equivalent
instead: 4.2 → is `index.html`'s inline `<script>` organised in a
consistent order (state/constants, then DOM lookups, then handlers,
then init) rather than ad hoc; 4.3 → is state kept local to the
function/closure that owns it vs. reached for `localStorage` or a
shared top-level `let` only when data genuinely needs to survive a
reload or cross screens (`connSettings`, `zoneNames`, `zoneTemps`,
`livePollEnabled`, `installBannerDismissed` are the only real "global"
state here, all deliberately in `localStorage`, not an in-memory
store/context). Don't fail this section for the literal absence of
props/components — that absence is the correct outcome for this stack,
not a gap.

### 4.1 Separation of Concerns

- [ ] UI components (if any) contain no business logic
- [ ] Business logic lives in services / hooks / use-cases — not
      directly in UI components or route handlers
- [ ] Data fetching is separated from presentation
- [ ] No direct DB calls from the UI/presentation layer

### 4.2 Component Structure (Frontend) `[STACK-SPECIFIC — example order]`

- [ ] Components follow a consistent internal order — the project's own
      convention, e.g.: 1. Imports 2. Types / interfaces 3. Constants
      4. Component function 5. Hooks 6. Handlers 7. Render 8. Exports
- [ ] No inline styles except dynamic values
- [ ] Props are destructured at the function signature
- [ ] Default props are explicit

### 4.3 State Management (Frontend)

- [ ] Local state used for UI-only concerns
- [ ] Global state used only for truly shared data
- [ ] No prop drilling beyond 2 levels (extract to context or store)
- [ ] State is normalised — no duplicated data across stores

---

## SECTION 5 — API & DATA LAYER

### 5.1 API Design

- [ ] Endpoints follow consistent naming: /api/v1/resource/:id/sub-resource
      (or the equivalent convention for GraphQL/gRPC if that's this
      project's API style — see Section 0)
- [ ] HTTP verbs used correctly (if REST): GET reads, POST creates, PUT
      replaces, PATCH updates, DELETE removes
- [ ] Responses follow a consistent shape, defined once for the project
      (e.g. `{ data: {}, error: null, meta: {} }`)
- [ ] All endpoints return appropriate status/error codes
- [ ] Pagination implemented on all list endpoints

### 5.2 Data Validation

- [ ] All inputs validated at the API boundary (e.g. Zod, Pydantic, a
      JSON Schema validator — whatever this project's stack uses)
- [ ] DTOs used — raw ORM/database models not exposed directly
- [ ] Response shapes typed end-to-end
- [ ] **If this project is multi-tenant:** the tenant/org identifier is
      always scoped on every query — no cross-tenant data leakage
      possible. This is `DEFECT_DISCIPLINE.md`'s own illustrative Rule 1
      example and `REVIEWER_CANARY.md`'s `authz-001` canary — treat a
      miss here as Critical severity, not a style nit. Remove this item
      entirely if the project genuinely has no multi-tenancy concept;
      don't leave it unchecked as if it were a real gap.

### 5.3 Database `[STACK-SPECIFIC — example is Prisma/PostgreSQL]`

- [ ] All queries use parameterised statements — no raw string
      concatenation into SQL (this is the injection surface
      `REVIEWER_CANARY.md`'s `sqli-001` canary tests for)
- [ ] Migrations version-controlled and reversible
- [ ] No direct DB access from the UI/presentation layer
- [ ] Indexes exist on all foreign keys and frequently filtered columns
- [ ] Soft deletes used for sensitive or auditable data, where the data
      classification (`DATA_CLASSIFICATION.md`) calls for it
- [ ] All "fetch many" queries have an explicit limit or cursor
      pagination — no unbounded result sets
- [ ] No write-in-a-loop pattern where a single batched write would do
      (the general shape of `REVIEWER_CANARY.md`'s `nplus1-001` canary)

---

## SECTION 6 — TESTING STANDARDS

*For the deeper question — is this suite actually catching bugs, not
just executing lines — see `TEST_EFFECTIVENESS_AUDIT.md`, which pairs
with this section the same way `MUTATION_TESTING.md` pairs with
`TESTING_HANDOFF.md` §6's "coverage % lies" warning.*

### 6.1 Coverage

- [ ] Unit tests for all utility functions and business logic
- [ ] Integration tests for all API endpoints
- [ ] Component tests for all interactive UI elements (if applicable)
- [ ] E2E tests for all critical user journeys
- [ ] Minimum coverage threshold: **80% real V8 execution coverage of
      index.html's inline script during the Playwright E2E run**
      (measured 84.8% at the time this floor was set; enforced by
      `scripts/check-coverage.mjs` in CI) — bootstrapped at this
      codebase's measured coverage, not an arbitrary target, per
      `TESTING_HANDOFF.md` §4's ratchet pattern. No separate unit-test
      coverage number exists — there is no unit-test layer (see Section
      0: nothing is isolable to unit-test in a single-file app).

### 6.2 Test Quality

- [ ] Tests follow AAA pattern: Arrange / Act / Assert
- [ ] No tests that only test implementation detail (test behaviour)
- [ ] No flaky tests (tests that pass/fail intermittently)
- [ ] Mocks reset between tests
- [ ] Test descriptions are human-readable sentences:
      GOOD: "returns 404 when user is not found"
      BAD: "test getUserById error case"

### 6.3 Test Organisation

- [ ] Tests in a consistent location, mirroring source structure
- [ ] Shared fixtures in a dedicated fixtures directory
- [ ] No test logic in production code
- [ ] CI fails on test failure — no skipped tests merged to main
- [ ] Pre-commit hook runs the project's real test/type-check commands —
      `agent-governance-kit.md`'s test-command auto-detection
      (`package.json`/pytest/go/cargo, or a `.claude/test-command`
      override) is the portable mechanism for this; don't hardcode a
      specific runner's invocation here if that kit is installed.

---

## SECTION 7 — DOCUMENTATION

### 7.1 Code-Level

- [ ] All public functions/methods and API routes have doc comments
      (JSDoc, docstrings, godoc, etc. — whatever the language's
      convention is)
- [ ] Complex algorithms have inline explanation comments
- [ ] No obvious comments that restate the code:
      BAD: // increment i by 1 → i++
- [ ] Type definitions exported and documented (where the language has
      an explicit type system)

### 7.2 Project-Level

- [ ] README.md exists with: setup, env vars, run commands
- [ ] CONTRIBUTING.md exists with: branch naming, PR process, standards
      link
- [ ] API documented in a format appropriate to this project (OpenAPI/
      Swagger, generated reference docs, a hand-written reference page —
      whatever's actually maintained and current)
- [ ] Changelog maintained (commit-convention-derived, or a hand-written
      `CHANGELOG.md` — see this pack's own `CHANGELOG.md` for the
      pattern)

---

## SECTION 8 — GIT & VERSION CONTROL

### 8.1 Commits

- [ ] Commits follow the project's commit convention (Section 0) — e.g.
      Conventional Commits: feat: / fix: / perf: / security: / chore: /
      refactor: / test: / docs:
- [ ] No commits directly to main without passing CI (pre-commit hook)
- [ ] Commits are atomic — one logical change per commit
- [ ] No binary files or build artefacts committed
- [ ] `.gitignore` covers this project's actual build/dependency
      artefacts (e.g. `node_modules`/`.next` for a Node project,
      `__pycache__`/`.venv` for Python, `target/` for Rust/Java) — the
      specific paths are `[STACK-SPECIFIC]`, the requirement isn't

### 8.2 Pull Requests

- [ ] PRs are small — under **400 lines changed (warn), 1,000 lines
      (hard block in CI)** — this project's actual thresholds, matching
      `scripts/check-diff-size.sh`'s `WARN_LINES`/`HARD_LINES` (see
      `QUALITY_STANDARD.md` §5 for the research behind why this matters
      and where the number comes from; `agent-governance-kit.md`'s
      `check-diff-size.sh` is the mechanical enforcement)
- [ ] PRs have a description explaining what and why
- [ ] CI must pass before merge
- [ ] No secrets or credentials in diff (`agent-governance-kit.md`'s
      `gitleaks` pre-commit gate and `CI_TEMPLATES.md`'s CI-level scan
      are the mechanical enforcement for this)

---

## SECTION 9 — CONFIGURATION & ENVIRONMENT

### 9.1 Environment Variables

- [ ] All config from environment variables — no hardcoded config
- [ ] `.env.example` committed with all required keys (no values)
- [ ] Separate config per environment (local `.env` / the platform's
      real secrets mechanism in each deployed environment — see
      `SECRETS_MANAGEMENT.md`)
- [ ] Secrets never committed — validated by the pre-commit gitleaks gate
- [ ] **List this project's actual required environment variables here**
      (name only, never a value) — don't leave a placeholder list from
      another project in place; an inherited list that doesn't match
      the real `.env.example` is worse than no list, the same
      "unenforced absolute is worse than an honest gap" reasoning as
      §1.3 above.

### 9.2 Tooling Config

- [ ] Linter config committed and enforced in CI
- [ ] Formatter config committed
- [ ] Pre-commit hooks configured (see `agent-governance-kit.md`)
- [ ] Deploy script (if any) committed and version-controlled

---

## SECTION 10 — ACCESSIBILITY (FRONTEND)

*Skip this whole section for a backend-only or CLI project.*

- [ ] All images have meaningful alt attributes
- [ ] All interactive elements are keyboard navigable
- [ ] Colour contrast meets WCAG AA (4.5:1 for text)
- [ ] ARIA labels on all icon-only buttons
- [ ] Forms have associated labels for all inputs
- [ ] Focus indicators visible on all interactive elements
- [ ] No content relies on colour alone to convey meaning

---

## SCORING GUIDE

| Pass Rate | Grade | Action                     |
| --------- | ----- | -------------------------- |
| 90–100%   | ✅ A  | Maintain                   |
| 75–89%    | 🟡 B  | Schedule improvements      |
| 60–74%    | 🟠 C  | Prioritise refactor sprint |
| Below 60% | 🔴 D  | Immediate action required  |

---

## Per-project setup checklist

1. Copy this file into the target project (e.g. `docs/CODE_STANDARDS.md`).
2. Fill in Section 0 with the project's real stack — do not leave the
   `[ EDIT ]` placeholders.
3. Read every section marked `[STACK-SPECIFIC]` and either retarget its
   worked example to the real stack, or delete the section if it
   genuinely doesn't apply (multi-tenancy, frontend-only sections, etc.)
   — don't leave an inapplicable rule unchecked as if it were a real gap.
4. Bootstrap every ratchet-style number (file-size limit, coverage
   threshold, PR-size limit) at this codebase's own measured reality
   (§1.3's pattern), not a number copied from another project.
5. List this project's actual required environment variable *names*
   (§9.1) — never copy another project's list.
6. Run `STANDARDS_AUDIT.md` against the filled-in version to get a
   baseline conformance report.

---

## How this fits with the rest of the pack

- `STANDARDS_AUDIT.md` is the read-only conformance check against this
  ruleset — pair the two the same way `DEFECT_DENSITY_KIT.md` pairs a
  threshold with its enforcement script.
- `TEST_EFFECTIVENESS_AUDIT.md` goes deeper than this file's Section 6 —
  it audits whether the tests that exist are actually catching bugs, not
  just whether coverage checkboxes are ticked.
- Several checklist items here point at mechanisms this pack already
  ships rather than re-describing them: `agent-governance-kit.md`'s
  diff-size gate and test-command auto-detection (§6.3, §8.2),
  `gitleaks` secret scanning (§8.2, §9.1), `SECRETS_MANAGEMENT.md`
  (§9.1), `DATA_CLASSIFICATION.md` (§5.3's soft-delete note),
  `REVIEWER_CANARY.md`'s canary defect classes (§5.2, §5.3).
- Like every other kit in this pack, ratchet — don't rewrite: bootstrap
  every numeric threshold at measured reality (`QUALITY_STANDARD.md` §8).

---

_CODE_STANDARDS.md — portable reference ruleset, part of the AI
Governance Kit._
