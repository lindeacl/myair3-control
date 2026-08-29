# Secrets Management Standard — portable across projects

**Concrete tooling scope: AWS-native.** The *principles* below (never
commit a secret, least-privilege retrieval, rotate on a cadence, rotate
immediately on any suspected exposure) apply to any cloud or none. The
*mechanisms* — Secrets Manager, SSM Parameter Store, IAM ARN-scoped
policies — are AWS-specific. See "Adapting to another platform" near the
end for the non-AWS version of each mechanism.

`gitleaks` (wired into `agent-governance-kit.md`'s pre-commit hook and
`CI_TEMPLATES.md`'s CI runs) catches secrets someone typed into a file
that's about to be committed. It says nothing about how secrets should be
stored, retrieved, or rotated once the application is actually running.
This doc is that missing half.

---

## 1. Where secrets live (and don't)

| Never | Instead |
|---|---|
| `.env` files committed to git (even "just for local dev, we'll gitignore it later") | `.env.example` with placeholder keys, committed; real values in a local, gitignored `.env` populated from the secrets store below |
| Secrets baked into a container image | Injected at runtime from the secrets store (env var populated by the orchestrator, or fetched by the app on startup) |
| Secrets in CloudFormation/Terraform parameters passed as plain strings | `{{resolve:secretsmanager:...}}` dynamic references (CloudFormation) / `data "aws_secretsmanager_secret_version"` (Terraform) — the secret value never appears in the template, state file, or CLI history |
| Long-lived secrets hardcoded in CI config | See `CI_TEMPLATES.md` §3 (OIDC role assumption) for AWS; equivalent short-lived-credential patterns for other clouds |

**Production secrets:** AWS Secrets Manager (supports automatic rotation)
or SSM Parameter Store (`SecureString` type, cheaper, no built-in rotation —
fine for values that don't need to rotate, e.g. a stable third-party API
key with manual rotation on compromise).

**Local development secrets:** a local, gitignored `.env`, populated by a
one-time script that pulls from Secrets Manager/Parameter Store — so
developers never hand-copy a production secret into a chat message or a
shared doc to bootstrap their local environment.

---

## 2. Least-privilege retrieval

The IAM policy granting `secretsmanager:GetSecretValue` should be scoped to
the **exact secret ARN(s)** a given role/function actually needs — never
`Resource: "*"` for secrets access, even for a "just this one Lambda, I'll
tighten it later" exception. A role that can read every secret in the
account turns one compromised function into a full secrets-store breach.

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:myapp/db-password-*"
}
```

The trailing `-*` matches Secrets Manager's random suffix on the ARN
without needing to hardcode it — scope to the secret's logical name prefix,
not the whole account.

---

## 3. Rotation

| Secret type | Rotation cadence | Mechanism |
|---|---|---|
| Database credentials | 30–90 days, or immediately on any suspected exposure | Secrets Manager automatic rotation (built-in Lambda rotation functions for RDS/Aurora/DocumentDB) |
| Third-party API keys | Per vendor's own guidance, or on team-member offboarding | Manual rotation via the vendor's console + `aws secretsmanager put-secret-value` |
| CI/CD credentials | N/A if using OIDC (`CI_TEMPLATES.md` §3) — nothing to rotate, tokens are already short-lived by design | — |
| Internal service-to-service tokens | 90 days | Secrets Manager automatic rotation with a custom rotation Lambda |

**A secret that was ever exposed (leaked in a log, pasted into a chat,
committed and later removed from git) is rotated immediately, not on the
next scheduled cycle** — git history retains the old value forever even
after a force-push scrub, so rotation is the only real remediation.

---

## 4. Per-project setup checklist

1. Inventory: list every secret this project currently uses and where it
   lives today. If any are in `.env` files committed to git, treat that as
   an incident — rotate them (§3), then remove from history
   (`git filter-repo` or BFG, not just a follow-up commit deleting the file).
2. Move production secrets to Secrets Manager / Parameter Store (§1).
3. Scope IAM retrieval policies to exact secret ARNs, not `Resource: "*"` (§2).
4. Set rotation cadence per secret type (§3); enable automatic rotation
   where Secrets Manager supports it natively (RDS/Aurora credentials).
5. Add `.env` (and any other local-secret file pattern) to `.gitignore` if
   not already there; commit `.env.example` with placeholder keys instead.
6. Confirm `gitleaks` (from `agent-governance-kit.md`) is installed and its
   `.gitleaks.toml` allowlist has zero entries unless each one is a
   confirmed false positive, allowlisted by fingerprint.

---

## Adapting to another platform

Every mechanism above has a direct equivalent elsewhere — the shape (a
managed store, scoped retrieval, automatic rotation where the platform
supports it) carries over even when the product name doesn't:

- **Firebase / Google Cloud projects:** Google Secret Manager
  (`gcloud secrets versions access`) is the direct equivalent of AWS
  Secrets Manager — versioned secrets, IAM-scoped access
  (`roles/secretmanager.secretAccessor` bound to the exact secret, not
  the project), automatic rotation via a scheduled Cloud Function instead
  of a rotation Lambda. For a mobile app pulling config at build/runtime
  (e.g. via Firebase Remote Config or a build-time `.env` injection from
  CI), the same rule from §1 applies: never commit the real values, only
  `.env.example` placeholders.
- **Azure projects:** Azure Key Vault — RBAC or access-policy-scoped to
  the exact secret (never a Key Vault-wide "get all secrets" grant),
  rotation via Key Vault's rotation policy or an Azure Function on a
  schedule. `CI_TEMPLATES.md` §3's Azure Pipelines template should use a
  Service Connection backed by a managed identity to read from Key Vault
  in CI, not a secret pasted into a pipeline variable — same principle as
  §3's OIDC guidance for AWS, different mechanism.
- **App Store Connect / mobile-signing credentials specifically:** these
  don't fit the "secrets store + IAM policy" shape at all — treat signing
  certificates, provisioning profiles, and App Store Connect API keys as
  their own category: stored in the CI platform's own secure file/secret
  storage (e.g. Azure Pipelines secure files, or `fastlane match` backed
  by an encrypted git repo or cloud storage bucket), never committed
  in plaintext, access scoped to the release pipeline only. Rotation
  cadence follows Apple's own certificate expiry, not a fixed calendar
  cadence.
- **No cloud secrets store at all (small project, nothing provisioned
  yet):** the floor is still "never commit a real secret" (§1's
  `.env`/`.env.example` split) and "rotate immediately on exposure" (§3's
  last rule) — those don't require any managed service, just discipline
  and `gitleaks`.

Pick the platform's actual store, verify it before naming it in a
project's own copy of this doc, and keep the rest of §1-4 (retrieval
scoping, rotation cadence, the setup checklist) — those transfer
unchanged regardless of which store backs them.

---

## How this fits with the rest of the pack

- `agent-governance-kit.md`'s `gitleaks` gate catches a secret *before* it's
  committed — this doc covers the secret's entire lifecycle after that point.
- `CI_TEMPLATES.md` §3's OIDC guidance is this doc's §1/§3 applied
  specifically to CI credentials — no rotation needed because nothing
  long-lived exists to rotate.
- `infra-gate-kit.md` §5's account-isolation principle applies here too:
  scope secret retrieval to the account/role that needs it, not broadly,
  same "structurally incapable of reaching what it shouldn't" reasoning.
