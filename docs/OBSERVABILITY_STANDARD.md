# Observability Standard — portable across projects

**Concrete tooling scope: AWS-native, server/backend-shaped.** The
*principles* (structured logs, request tracing, symptom-level alerting
linked to a runbook, SLOs with an error budget) apply to any backend
architecture. The concrete tools named (CloudWatch, X-Ray, SNS) are
AWS-specific, and the whole framework assumes a request-serving backend —
a client-only app (mobile, desktop, static frontend with no owned server)
needs a different shape entirely: crash reporting and client-side
telemetry, not server logs/traces/alarms. See "Adapting to another
platform" near the end for both cases.

`INCIDENT_RESPONSE.md` starts from "you already know there's an incident."
Nothing else in this pack covers how you'd actually *find out* — this doc
is the detection layer that INCIDENT_RESPONSE.md assumes already exists.

---

## 1. Structured logging (the foundation everything else depends on)

Every log line is a structured event, not free text — `{"level":"error",
"msg":"...", "requestId":"...", "userId":"...", ...}`, not
`console.log("something broke for user 123")`. Free-text logs can't be
queried, aggregated, or alerted on reliably; structured logs can.

**Required fields on every log line:** timestamp, level, service name,
a correlation/request ID (so one request's logs across services can be
joined), and — critically — **no PII/PHI in the message body** (see
`DATA_CLASSIFICATION.md` §3 for what counts and how to scrub it before it
reaches CloudWatch/Sentry/Datadog).

**AWS-native:** structured JSON to stdout, captured by CloudWatch Logs
automatically (Lambda, ECS, EKS with Fluent Bit). No custom log shipper
needed for the common cases.

---

## 2. Tracing

For anything spanning more than one service/function call, a trace ID that
threads through every hop — so "why was this request slow" is answerable
without manually correlating timestamps across five different log groups.

**AWS-native:** X-Ray (SDK auto-instrumentation for Lambda/ECS/API Gateway).
**Vendor-neutral:** OpenTelemetry — the safer long-term choice if this
project might ever move off AWS or run a multi-cloud architecture, since
X-Ray's SDK is AWS-specific.

---

## 3. Alerting — the actual detection layer

**Every alarm links a runbook.** An alarm that fires with no next-step
documented just produces panic at 2am. The runbook can be as short as
"check `INCIDENT_RESPONSE.md`'s revert procedure" — the point is the link
exists, not that every alarm needs a bespoke playbook.

**Alert on symptoms a user would notice, not every internal metric.**
Error rate, p99 latency, and availability are symptom-level. CPU usage,
individual queue depth, or a single pod restarting are cause-level — worth
graphing, not worth paging someone over unless they're a leading indicator
of an imminent symptom-level breach.

**AWS-native minimum viable alerting:**
- CloudWatch Alarms on: 5xx rate (ALB/API Gateway), Lambda error rate,
  Lambda duration p99, RDS/Aurora CPU + connections, DLQ message count > 0
  (a non-empty dead-letter queue is *always* worth paging on — it means
  something silently failed and stopped retrying).
- SNS topic per severity tier (page vs. Slack-notify-only) — don't page
  someone for a warning-tier alarm; that's how alert fatigue starts and
  real pages get ignored.

---

## 4. SLOs and error budgets

Pick 1–3 user-facing SLIs (e.g. "95% of checkout requests complete in under
2s," "99.9% of API requests succeed") and set an SLO with an error budget.
The error budget — not gut feel — is what decides whether to prioritize
reliability work over features this cycle: budget burning fast → pause
feature work, budget healthy → ship.

This doesn't need a dedicated SLO platform to start — a CloudWatch Alarm on
a burn-rate metric derived from the same 5xx/latency alarms in §3 is a
legitimate starting point. Add a dedicated tool (Datadog SLOs, a custom
dashboard) only once the manual tracking becomes the bottleneck.

---

## 5. Per-project setup checklist

1. Confirm every service logs structured JSON to stdout, not free text.
2. Confirm log lines carry a correlation ID; confirm PII/PHI scrubbing
   before logs leave the process (`DATA_CLASSIFICATION.md` §3).
3. Wire tracing (X-Ray or OpenTelemetry) across any multi-hop request path.
4. Set up the minimum-viable CloudWatch Alarms in §3; route to
   severity-appropriate SNS topics (page vs. notify-only).
5. Every alarm's description field links to a runbook or
   `INCIDENT_RESPONSE.md`, even if it's one line.
6. Pick 1–3 SLIs, set an SLO, wire a burn-rate alarm.
7. Link this doc from `INCIDENT_RESPONSE.md`'s "how you'd know" gap and from
   any on-call rotation documentation.

---

## Adapting to another platform

**Other backend clouds** — same shape, different product names:
- **Firebase / Google Cloud:** Cloud Logging (structured JSON, same
  requirement as §1) + Cloud Trace (OpenTelemetry-compatible, same role
  as X-Ray in §2) + Cloud Monitoring alerting policies (same role as
  CloudWatch Alarms in §3), notification channels per severity instead of
  SNS topics.
- **Azure:** Application Insights / Azure Monitor covers logging, tracing,
  and alerting in one product; Action Groups replace SNS topics for
  severity-routed notification.
- In both cases, **OpenTelemetry** (already named in §2 as the
  vendor-neutral option) is the safer default for tracing specifically —
  it's the same SDK regardless of which of the above ingests it.

**Client-only apps (mobile, desktop, static frontend — no owned backend
to instrument):** §1-4 as written don't apply — there's no server
emitting structured logs or serving requests to trace. The equivalent
detection layer is:
- **Crash reporting**, not structured server logs — Firebase Crashlytics
  (iOS/Android/Flutter) or the platform-native equivalent, capturing
  stack traces, device/OS context, and (per `DATA_CLASSIFICATION.md` §3)
  no PII/PHI in the crash context.
- **Client-side analytics/breadcrumbs** in place of request tracing — the
  question §2 asks server-side ("why was this slow/broken across
  services") becomes "what did the user do in the N steps before the
  crash/error" client-side.
- **App Store Connect's own crash and performance metrics** (and the
  Play Console equivalent, if also shipping Android) are a real,
  already-available detection layer for a mobile app — check them before
  assuming nothing exists yet.
- **§3's alerting principle still applies**: a crash-rate or ANR-rate
  spike should page/notify the same way a 5xx-rate spike would, linked
  to a runbook, not just visible on a dashboard nobody watches.
- **§4's SLO principle still applies**, reframed as client SLIs — e.g.
  "99.5% of sessions have zero crashes," "cold start under 2s for 95% of
  launches" — the error-budget-drives-prioritization logic is unchanged.

Verify whichever tool is actually in use in the project before naming it
in that project's own copy of this doc — don't assume Crashlytics is
wired up just because Firebase is; confirm it in the actual app config.

---

## How this fits with the rest of the pack

- This is the detection layer `INCIDENT_RESPONSE.md` assumes: that doc
  starts at "detected — how, alert or user report" in its postmortem
  template; this doc is what makes "alert" a real answer instead of "we
  found out from a customer."
- The DLQ-alarm and error-rate guidance here pairs directly with
  `DEFECT_DENSITY_KIT.md`'s `--source incident,prod` field-defect tracking
  — an alarm firing is frequently the FIRST evidence of the incident that
  later gets logged via `scripts/log-defect.sh --source incident`.
