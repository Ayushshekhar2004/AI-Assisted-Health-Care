# Repository Guidelines

These instructions apply to the entire repository. More specific `AGENTS.md` files may add constraints
for their own directories but must not weaken the privacy, security, or clinical-safety rules here.

## Scope and architecture

- Build this application as a single Next.js TypeScript modular monolith. Do not introduce separate
  deployable services without an approved architecture change.
- Keep domain logic in the corresponding directory under `src/modules`. App Router code in `src/app`
  is an interface layer and must not become a second implementation of domain rules.
- Communicate across modules through explicit public exports. Do not import another module's internal
  files or access its persistence objects directly.
- Keep strict TypeScript enabled. Validate all untrusted input and environment configuration with Zod
  at the boundary.
- Make the smallest change required. Do not rename public APIs or redesign unrelated modules.

## Privacy and security

- Never use real protected health information (PHI) or personally identifiable patient or clinician
  data in development, tests, fixtures, screenshots, demos, seeds, or prompts. Use clearly synthetic
  data only.
- Never log raw patient-authored or clinician-authored content. This includes message bodies,
  symptoms, clinical notes, intake responses, diagnoses, prescriptions, attachments, and AI prompts
  or outputs containing any of that data.
- Never log credentials, session identifiers, access tokens, refresh tokens, secrets, or signed
  storage URLs. Prefer structured events containing allow-listed identifiers and non-sensitive status
  codes.
- Enforce authorization on the server and at the database layer where supported. UI hiding is not an
  authorization control. Preserve row-level security assumptions and private storage defaults.
- Patient, doctor, and operational roles are separate trust boundaries. Grant the minimum capability
  needed for the requested workflow; never infer elevated access from a route or client-supplied role.
- Add an auditable event for sensitive access or mutation without copying clinical content into the
  audit record.

## Clinical safety

- AI output is assistive and provisional. AI must never issue a final diagnosis, sign or issue a
  prescription, or present itself as the responsible clinician.
- Final diagnoses and prescriptions require review and affirmative action by an appropriately
  authorized clinician.
- Red-flag findings must follow the escalation policy in `docs/clinical-safety.md`. Do not let an AI
  confidence score suppress or downgrade escalation.
- Do not describe the application as emergency care. Patient-facing red-flag flows must direct the
  patient to appropriate urgent or emergency services and must not depend solely on an AI response.

## Required verification before merging

- Add or update automated tests for every changed behavior, including negative authorization cases
  and clinical escalation paths where applicable.
- Run the narrowest relevant tests first, then the full test suite, lint, typecheck, and production
  build. All available checks must pass before merge.
- For database changes, add a forward migration and test row-level security for allowed and denied
  roles. Never weaken access controls merely to make a test pass.
- Review the final diff for authorization bypasses, broken row-level security assumptions, public or
  long-lived storage URLs, secret exposure, raw clinical-content logging, and unsafe AI claims.
- Document any check that could not run and its associated risk in the handoff. Missing required
  verification blocks merging unless an authorized reviewer explicitly accepts the risk.

Read `docs/architecture.md`, `docs/security.md`, and `docs/clinical-safety.md` before changing their
respective areas.

## Task execution template

Use the following contract before starting every implementation task. Replace
`<PASTE THE DAY TASK HERE>` with exactly one concrete task. If the placeholder has not been replaced,
do not infer or implement a task; request the missing task description.

```text
You are implementing exactly one task in an existing healthcare application.
1. First read AGENTS.md, docs/architecture.md, docs/security.md and the files relevant to this task.
2. Do not redesign unrelated modules or rename public APIs unless the task requires it.
3. Keep patient/doctor data private-by-default. Do not log message bodies, symptoms, prescriptions,
   tokens or secrets.
4. Use strict TypeScript, Zod validation and database migrations where applicable.
5. Add/update automated tests for the behavior you change.
6. Run the narrow tests first, then lint/typecheck/build if available.
7. Before finishing, review your own diff for auth bypass, broken RLS assumptions, insecure storage
   URLs and accidental sensitive logging.
8. Return: summary, files changed, migration notes, commands run, tests, and remaining risks.

Implement ONLY the task below:
<PASTE THE DAY TASK HERE>
```

## Notification on task completion

When you completely finish a requested task, run:
osascript -e 'display notification "Codex task finished" with title "Codex"' && afplay /System/Library/Sounds/Glass.aiff
