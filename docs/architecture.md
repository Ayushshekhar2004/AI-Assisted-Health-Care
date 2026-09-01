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
- `audit`: security and compliance event recording

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

Changes that require independently deployed services, direct cross-module table ownership, or weaker
role boundaries need an explicit architecture and security review before implementation.
