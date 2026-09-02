# Security and Privacy

## Data classification and development data

Patient and doctor records, messages, symptoms, intake responses, consultation notes, diagnoses,
prescriptions, attachments, and related metadata are sensitive. Credentials, tokens, secrets, session
identifiers, and signed URLs are security-sensitive.

Real PHI must never enter local development, automated tests, fixtures, seed data, demos,
screenshots, issue descriptions, or AI prompts. Use synthetic identities and clinical scenarios that
cannot be linked to a real person. Production exports must not be repurposed as development data,
even if direct identifiers appear to have been removed, unless a formally approved de-identification
process and environment exist.

## Authentication and authorization

- Authenticate and authorize on the server for every sensitive read or mutation.
- Treat patient, doctor, and operational roles as separate trust boundaries.
- Check resource ownership or an active, authorized care relationship in addition to checking role.
- Ignore client assertions of identity, role, ownership, or clinician relationship.
- Apply least privilege to users, background jobs, database roles, and external integrations.
- Use row-level security as defense in depth. Test deny cases and never use a privileged database
  client in user-scoped code to bypass policy.

Audit sensitive access and mutation using an actor identifier, action, target type and opaque target
identifier, result, and timestamp. An audit record must not duplicate patient content or clinical
details.

Audit events are append-only and browser roles have no direct table access. The centralized audit
service rejects arbitrary actions, mismatched target types, actor spoofing, and payload fields.
Recorded categories include available authenticated login-role anomalies, consent grant/withdrawal,
doctor verification and administrative queue access, appointment transitions, assigned record
views, document authorization/access, and clinician finalization actions. Failed credential attempts
without an authenticated actor are intentionally not stored because retaining an email, credential,
IP address, or other identifying payload would violate the content-free audit boundary; those events
belong in separately approved identity-provider security telemetry.

Patients may read only their own consent history and append decisions for centrally versioned AI
intake, teleconsultation, and document-processing purposes. Policy versions are server-controlled;
the browser cannot choose one. Withdrawal does not erase prior records and cannot interrupt an
active safety or care workflow, but it blocks new processing after that workflow ends. Operations
users may query only content-free audit fields through a server-authorized, read-only, paginated
function. The lookup enforces categorical filters, opaque UUID filters, bounded result size, and a
maximum 31-day range, and every successful lookup is itself audited.

## Logging and observability

Never log raw patient or clinician content, including:

- message bodies and attachments;
- symptoms, free-text intake, clinical notes, diagnoses, or prescriptions;
- AI prompts, retrieved context, or responses containing healthcare data; and
- tokens, passwords, secrets, cookies, session IDs, authorization headers, or signed URLs.

Use allow-listed structured fields, opaque correlation IDs, coarse event names, status codes, timing,
and sanitized error categories. Redact at the point of collection rather than relying only on a
downstream log processor. Do not send sensitive content to analytics, crash reporting, tracing, or
third-party monitoring systems.

Application security logs must use the centralized allow-listed logger, which redacts sensitive key
names and rejects nested or arbitrary values. Do not pass clinical content to the logger and do not
assume redaction makes patient content safe to collect.

## AI instruction and tool boundaries

Patient and clinician text is data, not authority. Server-side model adapters place it in a marked
untrusted-data envelope and never interpolate it into system or developer instructions. Shared
guardrails forbid role changes, identity claims, secret disclosure, prescription finalization,
server actions, and red-flag overrides. Strict Zod schemas validate every model result; generated
operational instructions fail closed rather than being displayed or persisted as model-authored
actions.

Current text AI workflows expose no tools. OpenAI requests explicitly disable tool choice, Ollama
requests send an empty tool set, and an Ollama response containing a tool call is rejected. Adding a
tool later requires a narrow Zod input schema plus fresh server-side role and resource authorization;
model output, client identifiers, and UI state are never authorization evidence.

AI provider errors are normalized before reaching product UI. Patient-facing messages do not name
deployment topology, model configuration, credentials, internal validation details, or raw provider
errors. AI telemetry is allow-listed to workflow name, failure category, and duration. It must not
contain patient/doctor identifiers, intake content, prompts, outputs, or exception messages.

Offline evaluation fixtures must be purpose-written synthetic data. The fixture loader rejects
identity-field keys and common direct-identifier patterns before schema validation. Evaluation
reports must contain only synthetic case IDs, categorical scores, and failed field names; they must
not reproduce fixture narratives or be populated from production exports.

## Web request protections

- State-changing requests require an exact same-origin `Origin` header. For browser HTML forms where
  Safari omits `Origin`, middleware accepts only a browser-controlled `Sec-Fetch-Site: same-origin`
  fallback with a form content type. JSON/API mutations do not receive this fallback. Next.js Server
  Actions retain their built-in origin validation.
- Supabase session cookies are normalized to `HttpOnly`, `SameSite=Lax`, root path, and `Secure` on
  HTTPS responses. Authentication state must not be copied into browser storage.
- Auth, intake, realtime-token, video-token, and consultation-start endpoints have bounded
  fixed-window rate limits and request-size limits. Rate-limit identifiers are pseudonymized with a
  server-only salt and are never logged.
- JSON token endpoints stream and reject bodies larger than 4 KiB before parsing. Form inputs retain
  their stricter Zod field limits; document uploads retain their separate validated 10 MiB limit.
- Global headers deny framing and MIME sniffing, restrict browser capabilities and referrers, and set
  a restrictive CSP. The CSP permits inline styles and scripts required by the current Next.js
  runtime; replacing that allowance with per-request nonces remains preferred before production.

The built-in limiter is per application process. A multi-instance production deployment must replace
its storage with an approved shared atomic backend while preserving the same fail-closed interface.

## Storage, transport, and secrets

- Keep clinical files and records private by default and encrypt them in transit and at rest.
- Authorize each file access before issuing a short-lived signed URL. Never persist or log that URL.
- Keep secrets in validated runtime environment configuration or an approved secret manager. Never
  commit them or expose server-only values through `NEXT_PUBLIC_` variables.
- Validate all external input with Zod and use parameterized database operations.
- Return sanitized errors to clients; do not expose stack traces, internal identifiers, or policy
  details.

## Server-only administrative access

Administrative and operational database actions must run only in trusted server-side jobs or route
handlers after explicit authorization. An `operations` value in a profile is not a database role and
does not grant broader RLS access through the browser or a user-session client.

Supabase secret and legacy `service_role` keys bypass row-level security and therefore require all of
the following controls:

- Store them only in the deployment secret manager under a server-only environment variable. Never
  use a `NEXT_PUBLIC_` name, send the value to a browser, commit it, log it, or include it in errors.
- Create a separate privileged client only inside the specific server-side operation that needs it.
  Do not export a shared privileged client or use it in ordinary user-scoped request code.
- Authenticate the caller and authorize the exact administrative action before creating or invoking
  that client. Never rely only on a client-provided role or profile field.
- Keep the operation narrowly scoped, validate inputs, and emit a content-free audit event containing
  the actor, action, opaque target identifier, outcome, and timestamp.
- Prefer a user-session client governed by RLS whenever bypass access is not strictly necessary.

Tests and local development must use synthetic records. Privileged keys from production must never be
used outside their approved production environment.

## Dependency vulnerability remediation

Run `npm run audit:dependencies` before merging dependency changes and in CI. For every high or
critical finding:

1. confirm the affected package and reachable code path without copying secrets or patient data into
   an issue;
2. prefer a compatible direct or transitive dependency upgrade and review the lockfile diff;
3. run the full application, database, lint, typecheck, and production-build checks;
4. document the advisory, resolved version, and verification evidence; and
5. if no fix exists, block release unless the security owner records a time-bounded exception with
   compensating controls and an explicit review date.

Do not run automated force upgrades without reviewing breaking changes. Moderate or lower findings
still require triage for reachability and healthcare-data impact.

## Data retention

Automated retention must use the versioned server-only job described in `docs/data-retention.md`.
Dry-run is the default. Apply mode requires an explicit server-only enable flag and may mutate only
allow-listed disposable classifications. Age is never sufficient authorization to delete a clinical
record, transcript, prescription, registered document, consent record, or audit event. Unresolved
legal schedules, legal-hold behavior, backup propagation, and anonymization standards are production
launch blockers.

Privacy requests are sensitive records. Patients may submit and view status only for their own
requests; operations access is server-authorized, paginated, and audited. Request details must never
be copied into audit events or application logs. Export, correction, account deactivation/deletion,
and grievance requests enter reviewed processing. A workflow status is not authorization to delete
or rewrite finalized medical records.

## Security verification before merge

Test authentication, allowed role/resource combinations, denied role/resource combinations, tenant
or patient isolation, row-level security, and private file access when affected. Run relevant tests,
the full suite, lint, typecheck, and production build. Review the diff for authorization bypasses,
privileged clients in request paths, weakened RLS, public storage configuration, leaked secrets, and
sensitive logging. A known failure in these checks blocks merging unless risk acceptance is explicit
and authorized.
