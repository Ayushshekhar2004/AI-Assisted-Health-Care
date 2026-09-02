# Architecture

## Modular monolith

The system is one deployable Next.js TypeScript application. UI, route handlers, domain logic, and
persistence adapters live in the same repository and release together. This is a modular monolith:
module boundaries remain meaningful even though there is no network boundary between them.

Domain modules live under `src/modules`:

- `auth`: identity, sessions, and authorization policy
- `patient`: patient profile and patient-owned workflows
- `doctor`: clinician profile, credentials, and clinician-owned workflows
- `intake`: structured collection of patient-provided information
- `triage`: prioritization support and red-flag escalation
- `scheduling`: appointment availability and booking
- `consultation`: clinician-patient encounter workflow
- `prescription`: clinician-controlled prescription workflow
- `notification`: private event generation and server-side delivery providers
- `audit`: security and compliance event recording
- `monitoring`: content-free operational errors, counters, and latency measurements

Code in `src/app` defines delivery concerns such as pages, layouts, route handlers, and request
composition. It may call module public APIs but must not contain duplicated domain policy.

## Module boundaries

Each module owns its domain rules and, when persistence is added, its data-access implementation.
Cross-module calls use deliberately exported functions or types from the target module's public entry
point. Modules must not:

- import another module's internal implementation;
- query or mutate another module's tables through ad hoc data access;
- bypass `auth` authorization decisions;
- bypass `audit` requirements for sensitive operations; or
- create a second source of truth for another module's state.

Shared code is limited to genuinely domain-neutral primitives. A shared directory must not become a
place to hide cross-domain business logic.

## Role boundaries

Roles are enforced capabilities, not navigation labels:

- A patient can access only their own data and workflows explicitly shared with them.
- A doctor can access patient data only when a valid care relationship and the specific workflow
  authorize it. Being a doctor does not grant global patient access.
- Operational or administrative roles receive only explicitly documented non-clinical capabilities.
  They do not inherit clinician authority.
- Service processes use narrowly scoped identities and cannot impersonate a patient or doctor.

All authorization decisions occur on trusted server boundaries and are reinforced by database
row-level security when the database supports it. Client-provided IDs, roles, route names, and hidden
UI elements are never trusted as authorization evidence.

## Data and API boundaries

Validate request payloads, route parameters, external responses, and environment values with Zod
before domain code consumes them. Keep TypeScript strict and use explicit domain types after
validation. Database schema changes require forward migrations; access-policy changes require tests
for both allowed and denied access.

Sensitive storage is private by default. Deliver files through short-lived, authorized access rather
than public bucket paths or durable URLs.

Server-side text AI workflows depend on a provider abstraction. OpenAI is the default provider;
Ollama is an optional loopback or explicit RFC1918 private-LAN development provider.
Provider-specific transport code must return the same Zod-validated domain outputs and must never be
imported into browser components. Public Ollama hosts and production Ollama configuration are denied.
All patient, clinician, transcript, and structured-record content is serialized in a marked
untrusted-data envelope beneath an immutable shared security instruction. Text models receive no
application tools: OpenAI tool choice is disabled and Ollama tool requests/responses are denied.
Models can propose only strict domain output; they cannot select an actor, authorize a resource,
invoke a server action, finalize a clinical artifact, or alter deterministic red-flag state. Any
future AI tool must have a dedicated strict Zod input schema and repeat role plus resource
authorization on the server immediately before execution.

AI failure handling is deterministic and content-free. Timeout, provider outage, and invalid output
are normalized into categorical failures. Intake preserves the patient's submitted text, closes the
AI turn with missing fields retained for manual clinician review, and permits deterministic General
Medicine routing. Routing failures and low confidence select General Medicine; a retained red flag
still forces emergency urgency. Safe-care classification failure suppresses ordinary guidance.
Telemetry contains only workflow category, categorical outcome, and duration—never prompts, model
responses, clinical fields, actor identifiers, or provider error text.

Offline AI evaluation belongs to the `evaluation` module. Versioned JSON fixtures contain only
synthetic scenarios and are rejected when direct identifiers or identity fields are detected. The
harness makes no provider or database calls: it feeds fixed candidate outputs through the real
deterministic red-flag and routing policies, then reports only categorical results and failed field
names. See `docs/ai-evaluation.md`.

Evaluation reports bind results to explicit model, prompt, routing-policy, rule-set, dataset, and
runner versions. Red-flag false negatives are a release-blocking error category rather than a
score that can be averaged away by successful routine cases.

Safe Care While You Wait belongs to the `triage` module. Its model provider may classify a completed
intake into one controlled symptom category, but it cannot author patient guidance. Patient-facing
steps, prohibitions, warning signs, escalation text, and disclaimers come only from the centralized,
versioned guidance library. The service stores the exact validated library snapshot used for the
patient and suppresses normal guidance when deterministic red-flag logic or conservative higher-risk
context applies.

Notification delivery uses a server-only provider abstraction. Appointment state transitions create
private, content-free notification events in the database; providers render only allow-listed
logistics templates. The development provider performs no external delivery and is forbidden in
production. Scheduled reminder dispatch belongs to a trusted server job, never a public route.
Stable event UUIDs are provider idempotency keys; row-locked claims, expiring leases, and bounded
backoff retries coordinate duplicate jobs. Patient preferences may suppress only explicitly
non-essential categories, initially appointment reminders.

Changes that require independently deployed services, direct cross-module table ownership, or weaker
role boundaries need an explicit architecture and security review before implementation.

Appointment cancellation and rescheduling are scheduling-domain operations, not direct appointment
updates. Only requested or confirmed appointments may be changed. A reschedule atomically cancels
the original appointment and creates a requested replacement in an unbooked future slot for the same
doctor. The original appointment and its categorical change record remain immutable for history and
auditability. Finalized clinical artifacts are never modified by scheduling operations.

Doctor-created follow-up recommendations are immutable, categorical scheduling context attached to a
completed consultation with a recorded follow-up-required outcome. Patient rebooking carries only
the opaque recommendation link, recommending doctor, and timing category. It creates a new requested
appointment and deliberately does not attach the previous intake, consultation note, outcome, or
prescription; the patient must provide current context for the new encounter.

The `audit` module is the application boundary for content-free security events. Application code
uses its strict action/target schema and server-only recorder; authenticated callers can emit only
the narrow self/admin events authorized by the database function. Clinical and scheduling database
transactions retain atomic audit writes to the same centralized, immutable `audit_events` sink.
Consent inserts are audited by a database trigger so direct patient grants and withdrawals cannot
bypass the event. Audit records contain only actor UUID, allow-listed action, target type, opaque
target UUID, outcome, and timestamp—never an arbitrary payload.

The patient privacy center uses the patient module's centralized consent-purpose catalog and current
policy versions. Decisions are append-only; the latest deterministically ordered row controls future
use without rewriting historical versions. Revocation is rejected while an active intake,
teleconsultation, or document scan still depends on that purpose, and a recorded withdrawal blocks
new processing for that purpose. Operations audit lookup stays within the audit module and exposes
only paginated, allow-listed event fields over a maximum 31-day range.

Data retention belongs to a server-only retention module and trusted scheduled-job boundary. The
versioned development policy may dispose only terminal notification logistics and expired orphaned
private uploads. Registered documents and all clinical, transcript, prescription, consent, and audit
records remain protected pending an approved legal schedule. Apply mode is disabled by default,
batch-bounded, version-gated, and audited without content. See `docs/data-retention.md`.

Account and privacy requests are a separate append-only patient workflow for export, correction,
account deactivation/deletion review, and grievances. Patients can submit and view only their own
request status; operations can access details only through the audited review queue. Status changes
do not directly mutate identity or clinical tables. In particular, an account deletion request
cannot delete finalized consultations, prescriptions, transcripts, or registered documents while
the legal and clinical retention schedule remains unresolved.

Operational monitoring is a server-only module with a strict event catalog. Domain boundaries emit
categorical failures and bounded latency values through a provider abstraction. Raw identifiers are
excluded or transformed with a dedicated salted SHA-256 pseudonym before emission. Monitoring is
operational evidence, not an audit ledger, and must never receive clinical text or credentials.
The public `/health` route is liveness-only and bypasses dependency/session checks. Detailed active
readiness probes and recent process-local failure counts are available only inside the authorized
operations area. Probe results expose categorical status and latency, never endpoints or errors.

Deployment environments are explicit trust boundaries. Development, staging, and production use
separate Supabase projects, databases, Auth tenants, and private storage buckets. Configuration
markers must match the project URL and resource namespace before the app connects. See
`docs/environment-management.md`.
