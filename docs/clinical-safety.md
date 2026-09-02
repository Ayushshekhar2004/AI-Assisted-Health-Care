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

For a text-intake AI timeout, outage, or invalid response, the submitted patient text remains
available for clinician review while missing structured fields remain explicit; the product must not
invent replacements. Specialty routing then uses General Medicine as a deterministic fallback. Low
routing confidence also selects General Medicine. Safe-care classification failure suppresses
normal interim guidance. None of these fallbacks may clear or downgrade a deterministic red flag.

The application is not an emergency response service. User-facing content must not imply continuous
monitoring or guaranteed clinician response unless those capabilities are operationally verified.

## Safe care while waiting

Interim guidance is limited to a small, versioned library of clinician-reviewable content for
explicitly supported low-risk categories. A language model may select a controlled category from a
completed structured intake; it must never invent, extend, or rewrite the medical guidance. Model
output is schema-validated, and malformed or unsupported classifications must not produce normal
self-care steps.

Normal interim guidance must be suppressed when deterministic red-flag logic fires or conservative
higher-risk context is present, including pregnancy possibility, young children, frail/older people,
relevant serious history, current medicines, or allergy concerns. A red flag always retains the
existing urgent pathway and cannot be cleared by classification confidence. Interim content must not
diagnose, recommend prescription medicines or antibiotics, provide dosages, or claim to replace a
doctor.

Every guidance-library version and all patient-facing translations require approval by the designated
clinical owner before production use. Development content is not clinically validated merely because
automated safety-boundary tests pass.

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

Offline evaluation must include bilingual routine, ambiguous, and emergency cases. Any
`RED_FLAG_FALSE_NEGATIVE` result is release blocking and cannot be offset by aggregate pass rate.
Reports must retain the evaluated model, prompt, routing-policy, and red-flag-rule-set versions.

Cancellation and rescheduling must not alter completed appointments, finalized consultation notes,
finalized prescriptions, or recorded consultation outcomes. Corrections to finalized clinical
records require a separate, attributable correction workflow; until such a workflow exists, those
records remain immutable.

A follow-up recommendation is clinician-authored scheduling guidance, not a diagnosis or medication
renewal. Rebooking must not clone a previous prescription, imply that medicines should continue, or
assume the new encounter concerns the same clinical problem. Current symptoms and safety concerns
must be reassessed for the new encounter through the applicable intake and red-flag workflows.
