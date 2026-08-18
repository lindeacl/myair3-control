# Testing Handoff — a portable playbook

A reusable testing setup + discipline distilled from a production JS/TS service
(Fastify API + vanilla-JS frontends + PWA). Framework-agnostic where it can be;
opinionated where experience earned it. Copy this into a new project's
`docs/` (or root) and adapt the specifics — the **layer model** and the
**quality discipline** transfer unchanged; the exact tools are swappable.

> One-line summary: **Two runners (Vitest for unit/integration, Playwright for
> E2E), coverage as a ratchet not a target, and a CI gate that proves the tests
> actually ran and actually assert something.**

---

## 1. The layer model (this is the transferable part)

Pick a tool per layer, not one tool for everything. Each layer answers a
different question and fails for a different reason.

| Layer | Question it answers | Tooling used here | Swap-ins |
|-------|--------------------|-------------------|----------|
| **Unit** | Does this function do the right thing in isolation? | Vitest | Jest, node:test, Bun test |
| **Integration** | Do the units wire together against a real framework/db? | Vitest + framework's in-process request injector + **real** DB | Jest + supertest |
| **E2E** | Does the built app work in a real browser against a real backend? | Playwright (headless Chromium) | Cypress |
| **Static** | Lint + types + security patterns, no execution | ESLint, (tsc), Semgrep SAST | Biome, CodeQL* |
| **Secrets** | Is a credential committed? | gitleaks | trufflehog |
| **A11y** | Does the UI meet accessibility bars? | Lighthouse CI | axe-core (stronger) |

\* CodeQL needs paid GitHub Advanced Security on **private** repos — Semgrep OSS
is the free, local, no-account alternative and was chosen for that reason.

**Rule of thumb:** most logic lives in unit + integration; E2E is a thin,
high-value layer over the paths that move money / cross trust boundaries /
depend on migrations. Don't E2E what a unit test can prove.

---

## 2. Framework choices + why

- **Vitest** (not Jest) — native ESM, fast watch mode, and its **v8 coverage
  provider is AST-aware**, so coverage numbers are honest rather than inflated
  by transpilation artifacts. If you migrate from Jest, budget for the fact
  that Vitest's `restoreAllMocks()` only restores `vi.spyOn` spies — set
  `clearMocks: true` in config so `vi.fn()` call history resets between tests
  automatically (a silent cross-test leak otherwise).
- **jsdom** for frontend unit tests — lets you drive vanilla-JS DOM code without
  a browser. Set `environment: 'jsdom'` per frontend package.
- **Playwright** for E2E — runs the **built** bundle (not source) against a
  **real** database and a **stubbed** external payment/3rd-party switch, so it
  catches what unit tests can't: migrations that don't apply to an empty DB,
  bundles referencing unbundled paths, and arithmetic across a genuine
  transaction.

---

## 3. Directory & file conventions

```
<package>/
  src/
  test/
    unit/            # mirrors src/ structure
    integration/     # in-process request injection + real db
  vitest.config.js
e2e/                 # separate package: Playwright specs
  tests/*.spec.js
  support/
    global-setup.js  # build UIs -> migrate -> seed -> start stub -> start server
    seed.js          # seeds via the REAL services, never hand-written INSERTs
    <thirdparty>-stub.js
  playwright.config.js
```

Conventions that matter:
- **Test files mirror source names** (`float.js` -> `float.test.js`).
- **Seed via the real application code**, not raw SQL inserts. Hand-rolled
  fixtures drift from production logic (hashing, ledger entries) and then tests
  pass against data the app would never actually create.
- **Shared mock data in one place** (`test/mocks/`), not redeclared per file.
- Test names are **human sentences**: `'returns 402 when float is insufficient'`,
  not `'test float error'`.
- **Test/seed data is synthetic — never real user, patient, or customer data,
  even anonymized.** Anonymization is easy to get wrong (re-identification
  from quasi-identifiers is a known failure mode), and a copied-from-prod
  fixture drifts from what "synthetic" looks like the moment prod's schema
  changes. Generate fixtures programmatically or with a synthetic-data tool;
  never `pg_dump` a slice of production into a test fixture, even scrubbed.

---

## 4. Coverage policy — ratchet, don't target

- Use the **AST-aware v8 provider**. Scope it with `include: ['src/**/*.js']`
  so coverage reflects the whole surface, not just files a test happened to import
  (without `include`, v8 only counts imported files and flatters you).
- **Thresholds are a floor set at measured reality, minus a hair for churn** —
  their job is to stop *regression*, not to certify quality. Raise them as
  coverage grows; **never lower without a comment explaining why**.
- Put a real bar where it counts. Example policy: **80% lines on business-logic
  services**; be honest that bootstrap/wiring files (`main.js`, `server.js`) are
  deliberately uncovered and carried by E2E instead — say so in a comment rather
  than gaming the number.
- **Coverage % measures execution, not assertion strength.** A 100%-covered file
  can have worthless tests. See §6.

```js
// vitest.config.js
export default defineConfig({ test: {
  globals: true,
  environment: 'jsdom',           // 'node' for backend
  clearMocks: true,               // see §2
  coverage: {
    provider: 'v8',
    include: ['src/**/*.js'],
    thresholds: { statements: 77, branches: 67, functions: 71, lines: 84 },
  },
}});
```

---

## 5. CI gate design

The gate must fail closed and prove the tests were real. Non-negotiables:

- **Run every layer on every push and PR**: unit, integration, E2E, lint, SAST,
  secret-scan. If a package has tests, CI must run them — a test suite that
  never runs in CI is decoration (this repo shipped 9 frontend test files that
  ran on *no* push for weeks).
- **Errors fail the build; warnings are logged but don't block** — then ratchet
  `--max-warnings` down over time. Failing on day-one warnings just means nobody
  turns the check on.
- **Assert the suite actually ran.** A suite that can *skip* (missing db, missing
  env) will silently skip and go green. Add a CI step that asserts real-db
  suites executed, and **fail if any test was skipped** — a green tick that
  proves nothing is worse than a red one.
- **Pin external contracts to reality.** Any URL / env var / feature flag /
  scheduler job referenced *outside* the code needs a test asserting it resolves.
  (Real story: a scheduler endpoint 404'd unnoticed for months because a test
  had *codified* the 404 with a comment calling it correct.)
- **Secret scan gates on findings**, with `--redact` so nothing leaks into public
  logs, and an allowlist by **fingerprint** (not by file) so accepting one known
  fixture doesn't blind you to a new secret in the same file. This is a CI
  backstop — the same scan also belongs as a **local pre-commit gate** (see
  `agent-governance-kit.md`'s secret-scan step), which is mechanical rather
  than left to reviewer judgment, exactly for the same reason type/lint checks
  are mechanical.
- **Dependency / supply-chain scanning**: `npm audit` / `pip-audit` / `cargo
  audit` (pick per stack) on every push and PR, gating on high/critical
  findings. This is a CI-grain check, not a pre-commit one — it's
  network-bound and slow enough that blocking every local commit on it would
  train people to skip it. Allowlist accepted findings by **advisory ID with
  an expiry date**, not blanket-ignored, so a "temporarily accepted" CVE
  doesn't silently become permanent.

---

## 6. Test-QUALITY discipline (the crown jewels — steal these)

Coverage and green CI are necessary, not sufficient. Every rule below maps to a
real defect that survived review **with CI green**:

1. **Fail-before, pass-after — no exceptions.** Write the failing test, *run it,
   see it fail*, then fix, then see it pass. If you can't make it fail first, say
   so explicitly and explain why. (A regression test that passes *with the bug
   reintroduced* certifies nothing — and it happens constantly.)
2. **Interrogate your own test after it passes.** Ask *"what else would make this
   pass?"* A test that accepts `404` or `400` can certify a broken route as safe.
   A geometric assertion can pass because the value is `0` in the test
   environment, not because the behaviour is right.
3. **Property tests over enumerated tests for invariants.** Discover the surface
   (routes, jobs, handlers, money paths) programmatically and assert across *all*
   of it, so new code is covered the day it's written. Enumerated tests only
   cover the cases you thought of. (fast-check / jsverify / Hypothesis.)
4. **A skipped test is a failing test.** If a suite can skip, assert it didn't.
5. **Separate observed from believed.** "I ran X and saw Y" ≠ "I believe Y."
   Never relay a tool's or teammate's claim as verified — re-run it yourself.
   Especially: never trust a coverage number or a "tests pass" you didn't watch.
6. **Comments/docs/YAML are unverified claims, not evidence.** Where a comment
   contradicts the code, the comment is usually the bug. Probe the running system
   when behaviour matters.
7. **Write the concurrency question down.** For every read-then-write on money or
   shared state, answer *"what happens if two arrive at once?"* If the answer
   depends on timing it's a bug — reach for a DB constraint / conditional UPDATE
   and **test the race**, not an app-level check.
8. **Measure before optimising; report what did NOT move.** No performance change
   without before/after numbers under production-like conditions.

---

## 7. Known gaps to level up into (in priority order)

The stack above is a solid backbone but leaves these blind spots. Add them when
the stakes justify it — for anything touching money, #1–#3 are worth it early:

1. **Contract testing against real third parties.** If your money/critical path
   is stubbed in every test, stub drift is invisible — the vendor changes a field
   and every test stays green while prod breaks. Pin the stub to a captured real
   response, or use Pact/schema validation.
2. **Mutation testing (Stryker).** Directly measures assertion strength — the
   thing coverage % *doesn't*. Highest-leverage quality add if your history
   includes "green but worthless" tests.
3. **Property/fuzz tests on numeric/financial invariants** (rounding, balances
   never negative, `amount == settled`). Enumerated money tests miss the edge.
4. **Visual regression** (Playwright `toHaveScreenshot()`). Hand-written
   geometric/CSS assertions are brittle and pass with the bug live; pixel
   baselines catch UI regressions automatically.
5. **A11y automation (axe-core in the E2E run)** across *all* surfaces — stronger
   and broader than a Lighthouse category score on one page.
6. **Load testing wired into a real command.** Installing `autocannon`/`k6` isn't
   a test until something runs it and asserts a threshold.

---

## 8. Adoption checklist for a new project

- [ ] Pick the runner per layer (§1); don't force one tool to do all four.
- [ ] `clearMocks: true`, `include: ['src/**']`, v8 coverage (§4).
- [ ] Coverage thresholds = measured reality minus a hair; comment every number.
- [ ] E2E: build the app, real DB, stub externals, seed via real services (§3).
- [ ] CI runs **every** layer on push + PR; errors fail, warnings ratchet (§5).
- [ ] CI asserts suites actually ran and **fails on any skip** (§5).
- [ ] A test exists for every externally-referenced URL/env/flag (§5).
- [ ] Secret scan gates, redacts, allowlists by fingerprint (§5) — locally at
      pre-commit AND in CI.
- [ ] Dependency/supply-chain audit in CI, gated on high/critical, allowlisted
      by advisory ID with an expiry (§5).
- [ ] Team agrees on §6 — especially fail-before/pass-after and "interrogate your
      own test." It's in `pr-template.md` — install that, don't hand-roll a
      second checklist.
- [ ] Test/seed data policy: synthetic only, never copied from production (§3).
- [ ] Decide which of §7 the project's risk justifies; schedule them explicitly.
- [ ] If more than one agent session may touch this repo, read §9.

---

## 9. Concurrent agent sessions

If more than one Claude Code session (or a human and an agent) works the
same repo at once, the marker-file gates elsewhere in this pack
(`.claude/.review-pass`, `.push-approved`, etc.) are per-checkout, not
per-session — two sessions in the **same working tree** can race on writing
them. This is largely self-healing by design: every marker is keyed to a
content hash (a diff hash, a SHA), so a stale write from the "losing" session
just fails its own gate check rather than silently succeeding. But to avoid
the confusion of a gate rejecting a legitimate change because a different
session wrote a marker moments ago:

- **Prefer `git worktree add` per concurrent session** over two sessions
  sharing one checkout — each worktree gets its own `.claude/` state.
- If sharing a checkout is unavoidable, treat a gate rejection as "check
  whether another session just moved HEAD," not as a broken gate.

---

*Adapt freely. The tools are replaceable; §6 is not.*
