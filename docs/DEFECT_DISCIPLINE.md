# Defect Avoidance & Detection — a portable discipline

Ten rules for shipping fewer defects, distilled from real bugs that survived
review **with CI green**. Framework- and language-agnostic. Drop this into a
project's `CLAUDE.md`, `CONTRIBUTING.md`, or engineering handbook, and put the
checklist (§C) in the PR template so it's enforced at review time, not just read
once.

> If you adopt only two, adopt **Rule 1** and **Rule 6** — between them they
> account for most defects that get through a green pipeline.

---

## A. Avoidance — stop the defect being written

### 1. Fix the class, not the instance
When you fix a bug, **name the class it belongs to** and mechanically enumerate
(grep/AST) *every other member* before declaring done — and **report the
enumeration**. "I fixed the three cases you listed" is an incomplete answer;
the fourth, unlisted case is the one that pages you at 2am.
*Illustrative:* a fix applied only to the endpoints an audit named left several
more of the same shape live, including one that leaked across tenants.
**This is the single highest-value rule.**

### 2. Treat comments, docs, and config as unverified claims
A comment, README, or YAML value is a *claim*, not evidence. If behaviour
matters, **probe the running system**. When a comment contradicts the code, the
comment is usually the bug — fix it and say so.
*Illustrative:* a scheduler URL that 404'd for months, a runtime flag that
existed only in a comment, an env var everyone assumed was set — all would have
been caught by probing instead of trusting the doc.

### 3. For money or shared state, write the concurrency question down
For every read-then-write, answer explicitly, in words:
**"what happens if two of these arrive at once?"** If the answer depends on
timing, it's a bug. Reach for a **database constraint or a conditional/atomic
update**, not an application-level "check then write."
*Illustrative:* every duplicate-charge / double-spend bug is this exact shape —
a check and a write with a gap between them.

### 4. Measure before optimising — and report what did *not* move
No performance change without a **before/after number taken under
production-like conditions**. State explicitly what the change does **not**
improve.
*Illustrative:* the "obvious" optimisation (more threads) doesn't help when the
bottleneck is single-core CPU or an external call — only measurement reveals it.
An unmeasured perf fix is a guess wearing a diff.

### 5. Separate what you observed from what you believe
"I ran X and saw Y" is not "I believe Y." Never present someone else's claim —
a teammate's, a subagent's, a tool's summary, a cached result — as verified
fact. **Re-run it yourself.** Report verified and unverified findings
separately, and if you couldn't verify something, say so plainly.
*This rule is what makes the other nine trustworthy.*

---

## B. Detection — catch it when avoidance fails

### 6. Fail-before, pass-after — no exceptions
For every bug fix: **write the failing test, run it, capture the failure**, then
fix, then capture the pass. If you cannot make it fail first, say so explicitly
and explain why. A regression test that passes *with the bug reintroduced*
certifies nothing — and it happens constantly.

### 7. Interrogate your own test before trusting it
After a test passes, ask: **"what else would make this pass?"** A test that
accepts `404` or `400` can certify a broken route as *safe*. A geometric or
value assertion can pass because the number is `0` in the test environment, not
because the behaviour is right. Prove the test **fails when the bug is present**.
*Illustrative:* a first security sweep once reported every hole as "passing,"
and a pre-existing test had *codified* a bug with a comment calling it correct.

### 8. Prefer property tests over enumerated tests for invariants
For invariants (security, money, rounding, authz), **discover the surface
programmatically** — routes, handlers, jobs, inputs — and assert the invariant
across *all* of it. A list of named cases silently stops covering new code the
day someone adds a route. Property/fuzz testing finds the edge nobody enumerated.

### 9. A skipped test is a failing test
If a suite *can* skip (missing DB, missing env, conditional), add an assertion
that **fails when it does**. A green tick that proves nothing is worse than a red
one, because it buys false confidence. Also: if CI collects N tests but runs
fewer, treat the gap as a failure and trace it — don't accept the green.

### 10. Pin external contracts to reality
Any URL, env var, feature flag, or endpoint referenced **outside the code**
(scheduler jobs, deploy config, frontend→backend calls, third-party APIs) needs
a test asserting it **resolves / matches**. Otherwise it drifts silently and the
first sign is an outage. If your critical path is stubbed everywhere, add one
test that pins the stub to a captured real response.

---

### These rules are about avoidance and detection *before* ship. For what
happens when a defect gets through anyway — revert procedure, incident fast
path, required postmortem — see `INCIDENT_RESPONSE.md`. Every fix under Rule
1 and every incident should also be **logged**, not just fixed: see
`DEFECT_DENSITY_KIT.md`, which turns "we found and fixed a bug" into a
tracked defects-per-KLOC metric instead of an anecdote.

---

## C. PR-template checklist

Don't hand-roll this per project — copy `pr-template.md` from this pack into
`.github/pull_request_template.md` (or the Azure DevOps equivalent path). It
merges this discipline's checklist with `TESTING_HANDOFF.md`'s and
`DEFECT_DENSITY_KIT.md`'s into one file, so there's a single canonical
checklist instead of three overlapping ones drifting independently.

```bash
mkdir -p .github
cp "AI Governance Kit/pr-template.md" .github/pull_request_template.md
```

---

## D. Minimum viable adoption

Short on time? In order of leverage:

1. **Rule 1** (fix the class) + **Rule 6** (fail-before) — put both in the PR
   template today.
2. **Rule 5** (observed vs believed) — a cultural norm, costs nothing, prevents
   the most embarrassing misses.
3. **Rule 9** + **Rule 10** — one CI step each: fail on skipped tests, and a test
   that every externally-referenced URL/flag resolves.
4. Everything else as the codebase's risk justifies.

---

*The specifics of your stack will differ; these rules won't. Each one is a scar.*
