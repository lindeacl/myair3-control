# Data Classification Standard — portable across projects

`TESTING_HANDOFF.md` §3 covers test/seed data well: synthetic only, never
copied from production. This doc covers the gap that leaves open —
**production data itself**: what's sensitive, how it's protected at rest
and in transit, and how it's kept out of logs and error trackers. Relevant
to any project handling real user data; non-optional for anything handling
PHI (health data) or PCI (payment card data).

---

## 1. Classify before you build

Every data field a system stores gets one of these labels, decided at
design time (part of the spec, per `QUALITY_STANDARD.md` §1 — "no
implementation task begins without inputs/outputs defined," and data
sensitivity is part of that):

| Class | Examples | Handling |
|---|---|---|
| **Public** | Marketing copy, public product catalog | No special handling |
| **Internal** | Internal analytics, non-sensitive config | Access-controlled, not public |
| **Confidential** | Business financials, unreleased plans | Access-controlled, encrypted at rest |
| **PII** | Name, email, address, phone, SA ID/SSN | Encrypted at rest + in transit, access-logged, never in logs/error trackers unscrubbed |
| **PHI** | Diagnosis, medication, medical history, patient ID | Everything PII requires, plus: audit trail on every access, encryption keys managed separately from the data (AWS KMS with a dedicated CMK, not the account default key), retention/deletion policy defined explicitly |
| **PCI** | Card numbers, CVV | Never stored directly unless PCI-DSS compliant infrastructure is in place — use a tokenizing payment processor (Stripe, etc.) instead of touching raw card data at all |

If a field's classification isn't obvious, default to the stricter label —
downgrading later after confirming it's actually public is cheap; the
reverse (discovering PII was handled as Internal) is an incident.

---

## 2. Encryption

**The principle is platform-agnostic: encrypt every datastore at rest by
default, and use a dedicated key (not the platform's default/managed key)
for PHI/PCI-adjacent data so key access can be audited and scoped
independently.** The concrete mechanism differs by platform:

- **AWS:** every datastore (RDS, DynamoDB, S3, EBS) encrypted by
  default — this is a checkbox at creation time, not a retrofit-later
  item. For PHI/PCI-adjacent data, use a dedicated KMS CMK per data
  class, not the AWS-managed default key.
- **Firebase / Google Cloud:** Firestore and Cloud Storage are encrypted
  at rest by default using Google-managed keys; for PHI/PCI-adjacent data
  needing a dedicated key, use Cloud KMS with a customer-managed key
  (CMEK), same "not the platform default key" principle as AWS's CMK.
- **Azure:** Azure Storage/Cosmos DB are encrypted at rest by default;
  use Azure Key Vault-backed customer-managed keys for the PHI/PCI case.
- **App Store Connect / on-device data (mobile):** this doc's §1-4 still
  apply to data the app itself stores or transmits, but "encrypted at
  rest" for on-device storage means the OS-level mechanism (iOS Data
  Protection / Keychain, Android EncryptedSharedPreferences/Keystore) —
  verify what the app is actually using before documenting it, don't
  assume the OS default covers a given field's classification.
- **In transit:** TLS everywhere, including internal service-to-service
  calls inside a VPC — "it's internal, so it's fine unencrypted" is a
  common and incorrect assumption; a compromised node inside the VPC can
  still sniff internal traffic.
- **In transit:** TLS everywhere, including internal service-to-service
  calls inside a VPC — "it's internal, so it's fine unencrypted" is a
  common and incorrect assumption; a compromised node inside the VPC can
  still sniff internal traffic.

---

## 3. Keeping PII/PHI out of logs and error trackers

This is the most commonly missed part — teams encrypt the database
correctly and then log the exact same PII in plain text to CloudWatch or
Sentry via an unhandled exception's stack trace or a debug log line.

- **Scrub before logging, not after.** A logging middleware/formatter that
  redacts known PII field names (`email`, `ssn`, `dob`, `patientId`, ...)
  before the log line is emitted — not a periodic job that scans and
  deletes logs after the fact (by then it's already been indexed,
  potentially exported, and possibly already visible to whoever has log
  access).
- **Error trackers (Sentry, Bugsnag) need the same scrubbing** — an
  unhandled exception's stack trace frequently includes full request/
  response bodies by default, which is exactly where PII commonly leaks.
  Configure the SDK's `beforeSend` (Sentry) or equivalent hook to strip
  known-sensitive fields before the event is sent, not just at rest in
  the error tracker's own storage.
- **Never log full request/response bodies for endpoints handling
  PII/PHI**, even at debug level — a "temporarily enabled for debugging in
  prod" verbose-logging flag is one of the most common real-world PII leak
  vectors, precisely because it's meant to be temporary and often isn't
  reverted before someone forgets about it.

---

## 4. Retention and deletion

Define, per data class, before the data is first collected:
- How long it's retained (legal/regulatory minimums for PHI often mandate a
  *minimum* retention period — check the applicable regulation before
  assuming "delete ASAP" is even allowed).
- What "deletion" means concretely — soft-delete flag vs. hard delete vs.
  cryptographic erasure (deleting the KMS key encrypting a dataset, making
  it permanently unrecoverable without deleting each row individually).
- Backup retention — a backup outlives the "deleted" record unless the
  backup rotation policy also purges it; a deletion request that only
  touches the primary datastore isn't actually complete.

---

## 5. Per-project setup checklist

1. Classify every data field per §1 at design/spec time, not
   retroactively — part of the spec `QUALITY_STANDARD.md` §1 requires.
2. Confirm encryption at rest (dedicated key — KMS CMK / Cloud KMS CMEK /
   Key Vault-backed key, per §2's platform table — for PHI/PCI-adjacent
   data) and in transit, including internal service calls.
3. Add PII/PHI scrubbing to the logging middleware and error-tracker
   `beforeSend` hook — verify by deliberately triggering an error with a
   known PII value and confirming it doesn't appear in CloudWatch/Sentry
   (same "verify before trusting it" discipline as every gate in this pack).
4. Document retention/deletion policy per data class, including backup
   rotation.
5. Confirm `TESTING_HANDOFF.md` §3's synthetic-test-data policy is actually
   followed — test fixtures should never contain real values from any of
   the classes in §1 above.

---

## How this fits with the rest of the pack

- `TESTING_HANDOFF.md` §3 covers test data; this doc covers production data
  — together they're the full data-handling policy.
- `OBSERVABILITY_STANDARD.md` §1's "no PII in log messages" requirement is
  this doc's §3 applied specifically to the logging layer.
- `SECRETS_MANAGEMENT.md` covers *credentials*; this doc covers *user/
  patient/customer data* — related but distinct classes of sensitive
  information, both needing encryption and access control but different
  operational handling (secrets rotate, PII/PHI doesn't — it gets deleted
  or retained per policy instead).
