# Data Retention Policy — Development Version

Policy version: `retention-dev-v1`

This is an engineering safety policy, not an approved legal retention schedule. It permits cleanup
only for narrowly defined disposable data. It must not be enabled in production until legal,
clinical-governance, privacy, and security owners approve the deployment-specific schedule.

## Classifications

| Classification   | Current examples                                                                                                                  | Development behavior                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Operational data | Notification delivery attempts, provider delivery identifiers, bounded error codes                                                | Anonymize terminal delivery metadata after 30 days; delete terminal notification events after 365 days only when the appointment is terminal |
| Clinical records | Structured intake, triage and routing results, appointments, consultations, outcomes, prescriptions, registered patient documents | Protected; no automated deletion or anonymization                                                                                            |
| Transcripts      | Patient and visible assistant intake messages                                                                                     | Protected; no automated deletion or anonymization                                                                                            |
| Raw audio        | Microphone/realtime audio                                                                                                         | Collection and persistence disabled; the app stores confirmed text only                                                                      |
| Audit events     | Content-free security and compliance ledger                                                                                       | Immutable and protected; no automated deletion                                                                                               |
| Temporary files  | Private `patient-documents` objects older than 24 hours with no matching document metadata row                                    | Listed in dry-run and deleted through the Storage API only in explicitly enabled apply mode                                                  |

The job never treats age alone as evidence that a clinical artifact is disposable. A registered
document is a clinical record even if its underlying file is old. Temporary-file cleanup requires
both expiry and absence of registered metadata.

## Job operation

`runDataRetentionJob` is a server-only scheduler entry point. It defaults to `DRY_RUN`, validates the
policy version and batch size, and uses the privileged Supabase key only inside the job. `APPLY`
requires `DATA_RETENTION_EXECUTION_ENABLED=true`. Do not expose this function through a browser route.

Database changes are batch-bounded and version-gated. Apply runs create a content-free immutable
audit event containing only a system actor, action, opaque run identifier, outcome, and timestamp.
Temporary objects are first inventoried in the database, then removed through Supabase Storage so
the backing object and metadata remain consistent. Failures stop the job and must be retried by the
trusted scheduler; job inputs or file paths must never be logged.

## Launch blockers

The following decisions are unresolved and block production launch and production apply mode:

- governing jurisdiction and which entity is the legal record custodian/controller;
- minimum and maximum retention periods for intake, transcripts, consultations, prescriptions,
  uploaded reports, consent evidence, appointment records, and audit events;
- whether minors, prescriptions, medico-legal cases, disputes, investigations, or legal holds require
  longer retention or suspend deletion;
- whether withdrawal, account closure, correction, portability, and erasure requests require
  deletion, anonymization, restriction, or continued retention under an exception;
- required patient/clinician notice, approval evidence, and deletion verification;
- backup, replica, analytics, model-provider, notification-provider, and disaster-recovery deletion
  propagation timelines;
- an approved method for irreversible anonymization and re-identification-risk review; and
- ownership, monitoring, retry, incident response, and periodic evidence review for scheduled jobs.

No developer may fill these values from general assumptions or silently convert this development
policy into a production schedule. Legal approval must identify the policy version, jurisdiction,
effective date, accountable owner, and review date.

Account deactivation or deletion requests are recorded in the reviewed privacy-request workflow.
They do not override this retention policy and do not automatically delete finalized medical or
audit records. Operations may record that the request was reviewed, but destructive processing must
remain unavailable until the launch-blocking retention and legal-hold decisions above are approved.
