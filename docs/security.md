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

## Security verification before merge

Test authentication, allowed role/resource combinations, denied role/resource combinations, tenant
or patient isolation, row-level security, and private file access when affected. Run relevant tests,
the full suite, lint, typecheck, and production build. Review the diff for authorization bypasses,
privileged clients in request paths, weakened RLS, public storage configuration, leaked secrets, and
sensitive logging. A known failure in these checks blocks merging unless risk acceptance is explicit
and authorized.
