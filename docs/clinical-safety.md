# Clinical Safety

## Intended role of AI

AI in this application provides decision support. Its output is provisional, may be incomplete or
incorrect, and must be clearly distinguishable from a clinician-approved decision.

AI cannot:

- issue or communicate a final diagnosis;
- prescribe, sign, renew, alter, or discontinue medication;
- replace review by an appropriately authorized clinician; or
- claim that a patient is safe or that urgent care is unnecessary.

A final diagnosis or prescription requires an authorized clinician to review the relevant source
information and take an explicit, attributable action. Silence, timeout, default acceptance, or an AI
confidence threshold cannot count as clinical approval.

## Red-flag escalation

Red flags include configured findings that may indicate an urgent or emergency condition. Exact
clinical rules must be reviewed and versioned by qualified clinical governance; developers must not
invent or silently change thresholds.

When a red flag is detected, the system must:

1. show clear, prominent guidance to seek the appropriate urgent or emergency help, including local
   emergency services where the deployment has approved location-specific language;
2. avoid reassuring language, definitive diagnosis, or advice to wait for an AI response;
3. flag the case for timely human review through the approved escalation workflow;
4. preserve the red-flag state until an authorized human workflow resolves it; and
5. record a content-free audit event for detection, notification, routing, and resolution.

Escalation must not depend solely on generative AI. Deterministic safety rules and operational
fallbacks are required where red-flag handling is implemented. AI confidence must never suppress,
downgrade, or clear a red flag. If an AI service is unavailable, malformed, or uncertain, the system
must fail safely and retain applicable escalation.

The application is not an emergency response service. User-facing content must not imply continuous
monitoring or guaranteed clinician response unless those capabilities are operationally verified.

## Safe presentation

- Label AI-generated suggestions as unreviewed until clinician approval.
- Preserve provenance so reviewers can distinguish patient input, clinician-authored content, and AI
  output.
- Do not automatically copy AI suggestions into a final diagnosis, prescription, or signed clinical
  note.
- Give clinicians a meaningful way to reject or amend suggestions without friction or penalty.
- Do not expose internal confidence scores as a substitute for clinical explanation or review.

## Required testing before merge

Changes affecting intake, triage, consultation, diagnosis support, or prescriptions require tests for
normal paths, red-flag paths, ambiguous or missing input, AI timeout/failure, unauthorized access, and
human approval boundaries. Tests must confirm that AI cannot finalize diagnoses or prescriptions and
that red flags cannot be cleared by AI output.

Run narrow safety tests first, followed by the full suite, lint, typecheck, and production build.
Clinical rule or patient-facing safety-language changes also require review by the designated clinical
owner before merge. Unresolved safety-test failures block release.
