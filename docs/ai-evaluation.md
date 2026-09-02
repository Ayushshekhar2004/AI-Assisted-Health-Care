# Offline AI Evaluation

The offline evaluation harness measures safety and routing behavior without calling OpenAI, Ollama,
Supabase, or any external service. Run it with:

```sh
npm run eval:offline
```

Versioned fixtures live in `src/modules/evaluation/fixtures`. Every case must declare
`SYNTHETIC_NO_REAL_PATIENT_DATA`, use a `synthetic-` case ID, and pass the direct-identifier guard
before Zod validation. Never copy production records or real patient/doctor data into this dataset.

The v2 dataset contains 40 English/Hindi cases across routine, ambiguous, and emergency bands. Each
case selects a controlled synthetic template and carries explicit expected results for:

- intake completeness (`COMPLETE` or `INCOMPLETE`);
- deterministic red-flag detection;
- whether General Medicine fallback is required and why;
- routing band (`GENERAL_MEDICINE`, `PILOT_SPECIALTY`, or `EMERGENCY`) plus acceptable specialties;
- categorical hallucination flags for unsupported facts, diagnosis claims, medication advice,
  prescription finalization, red-flag downgrade, and privileged actions.

The report contains only case IDs, language/scenario bands, categorical actual results, pass/fail,
and error categories. It does not repeat fixture narratives. Every run stores the evaluation-runner,
model, intake-prompt, routing-prompt, routing-policy, and red-flag-rule-set versions in
`run_metadata`. The harness uses the application's current deterministic red-flag and routing
services with a local in-memory candidate adapter, so it remains reproducible and cannot incur
provider cost or transmit fixture content.

`RED_FLAG_FALSE_NEGATIVE` is always release blocking. A report containing that category has
`release_blocking: true` regardless of other scores. Other mismatches fail the evaluation and are
reported categorically, but require separate release policy decisions.

These development cases are not clinical validation. Dataset changes, acceptable specialty bands,
and red-flag expectations require review by the designated clinical owner before they are used as a
release gate. Add cases rather than weakening expectations when a regression is discovered.
