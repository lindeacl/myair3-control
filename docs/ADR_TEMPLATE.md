# Architecture Decision Records — a lightweight practice

`QUALITY_STANDARD.md` §1 ("spec before code") covers *behavior* specs —
inputs, outputs, edge cases for a piece of functionality. It doesn't cover
*architecture* decisions — "why DynamoDB over RDS here," "why we're
splitting this into two services instead of one," "why we chose to eat the
cost of a distributed transaction instead of an eventual-consistency
model." Those decisions are usually more expensive to reverse than a
behavior spec's edge-case choices, and are exactly the kind of thing a
future engineer (or a future agent session, or you in eight months) needs
the *reasoning* for, not just the outcome — the code shows what was built,
never why the alternatives were rejected.

---

## When to write one

Not every decision needs an ADR — most day-to-day implementation choices
are covered by the behavior spec and the code-reviewer. Write one when:

- The decision is **expensive to reverse** (a datastore choice, a
  synchronous-vs-async architecture, a build-vs-buy call, a decision that
  shapes how multiple future features get built).
- The decision **wasn't obvious** — a reasonable engineer could have gone a
  different direction, and future-you will wonder why this one was picked.
- The decision **trades off against a stated principle elsewhere in this
  pack** (e.g. choosing NOT to isolate prod into a separate AWS account
  despite `infra-gate-kit.md` §5 recommending it — that deviation needs its
  reasoning on record, not just silently done differently).

Skip it for reversible, low-stakes, or clearly-mandated-by-spec choices —
an ADR for every `if` statement is process theater, not documentation.

---

## Template

```markdown
# ADR-NNNN: <short title, e.g. "Use DynamoDB for session storage">

**Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
**Date:** YYYY-MM-DD

## Context
What forces are at play — the technical, business, or team constraints
that make this decision necessary right now. Not the decision itself yet,
just the situation.

## Decision
The choice made, stated plainly in one or two sentences.

## Alternatives considered
For each alternative seriously considered (not a token strawman list):
- **Alternative:** what it was
- **Why not:** the specific reason it was rejected — a real tradeoff, not
  "it seemed worse"

## Consequences
What this decision makes easier, and what it makes harder or forecloses.
Be honest about the downsides — an ADR that only lists upsides isn't
trustworthy to a future reader deciding whether to revisit the choice.

## Related
Links to the spec/PR this decision applies to, and any ADR it supersedes
or is superseded by.
```

---

## Per-project setup checklist

1. Create `docs/adr/` (or wherever the project keeps architecture docs).
2. Number sequentially: `docs/adr/0001-use-dynamodb-for-sessions.md`.
3. Add a one-line pointer from `README.md` or `CLAUDE.md`: "Architecture
   decisions are recorded in `docs/adr/` — check there before assuming a
   choice was accidental."
4. When superseding an ADR, don't delete the old one — mark its status
   `Superseded by ADR-XXXX` and add the new one. The history of *why*
   something changed is as valuable as the current state.

---

## How this fits with the rest of the pack

- Distinct from `QUALITY_STANDARD.md` §1's behavior specs — specs describe
  what a feature does; ADRs describe why the system is shaped the way it is.
- An ADR that documents a deliberate deviation from this pack's own
  recommendations (e.g. `infra-gate-kit.md` §5's account-isolation
  guidance, skipped for a specific documented reason) is exactly the right
  use of this practice — it turns "we didn't do the recommended thing" from
  an unexplained gap into a recorded, reasoned tradeoff.
