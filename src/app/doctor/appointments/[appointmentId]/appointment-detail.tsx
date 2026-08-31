import type { DoctorAppointmentDetail } from '@/modules/consultation/server';

import { AppointmentVideoCall } from '../../../_components/appointment-video-call';
import { LocalDateTime } from '../../../_components/local-date-time';
import { TranscriptPanel } from './transcript-panel';

const languageLabels = { en: 'English', hi: 'Hindi' } as const;
const genderLabels = {
  woman: 'Woman',
  man: 'Man',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
} as const;

function fieldLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

function TextList({ values }: Readonly<{ values: readonly string[] }>) {
  return values.length ? (
    <ul>
      {values.map((value, index) => (
        <li key={`${index}-${value}`}>{value}</li>
      ))}
    </ul>
  ) : (
    <p>None provided.</p>
  );
}

export function AppointmentDetail({
  detail,
}: Readonly<{ detail: DoctorAppointmentDetail }>) {
  const intake = detail.structuredIntake;
  const routing = detail.routing;

  return (
    <>
      <section aria-labelledby="appointment-summary">
        <h2 id="appointment-summary">Appointment</h2>
        <p>
          <LocalDateTime endsAt={detail.endsAt} startsAt={detail.startsAt} />
        </p>
        <p>Status: {fieldLabel(detail.status)}</p>
        {['CONFIRMED', 'IN_PROGRESS'].includes(detail.status) ? (
          <AppointmentVideoCall appointmentId={detail.id} />
        ) : null}
      </section>

      <section aria-labelledby="patient-context">
        <h2 id="patient-context">Patient-provided profile context</h2>
        <dl className="appointment-detail-grid">
          <div>
            <dt>Display name</dt>
            <dd>{detail.patient.displayName}</dd>
          </div>
          <div>
            <dt>Age</dt>
            <dd>{detail.patient.ageYears ?? 'Not provided'}</dd>
          </div>
          <div>
            <dt>Gender</dt>
            <dd>
              {detail.patient.gender
                ? genderLabels[detail.patient.gender]
                : 'Not provided'}
            </dd>
          </div>
          <div>
            <dt>City</dt>
            <dd>{detail.patient.city ?? 'Not provided'}</dd>
          </div>
          <div>
            <dt>Preferred language</dt>
            <dd>
              {detail.patient.language
                ? languageLabels[detail.patient.language]
                : 'Not provided'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="structured-intake">
        <h2 id="structured-intake">Structured intake</h2>
        <p className="ai-unverified-notice" role="note">
          AI-generated summary — unverified until reviewed by the doctor. It is
          not a diagnosis or prescription.
        </p>
        <p>Intake state: {fieldLabel(detail.intakeState)}</p>
        {intake ? (
          <dl className="appointment-detail-grid">
            <div>
              <dt>Chief complaint</dt>
              <dd>{intake.chief_complaint ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Onset</dt>
              <dd>{intake.onset ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{intake.duration ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>{intake.severity ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Associated symptoms</dt>
              <dd>
                <TextList values={intake.associated_symptoms} />
              </dd>
            </div>
            <div>
              <dt>Relevant history</dt>
              <dd>
                <TextList values={intake.relevant_history} />
              </dd>
            </div>
            <div>
              <dt>Current medicines</dt>
              <dd>
                <TextList values={intake.current_medicines} />
              </dd>
            </div>
            <div>
              <dt>Allergies</dt>
              <dd>
                <TextList values={intake.allergies} />
              </dd>
            </div>
            <div>
              <dt>Pregnancy possibility</dt>
              <dd>{fieldLabel(intake.pregnancy_possibility.response)}</dd>
            </div>
            <div>
              <dt>Missing information</dt>
              <dd>
                <TextList values={intake.missing_information.map(fieldLabel)} />
              </dd>
            </div>
          </dl>
        ) : (
          <p>No structured intake is associated with this appointment.</p>
        )}
      </section>

      <section aria-labelledby="red-flag-checks">
        <h2 id="red-flag-checks">Deterministic red-flag checks</h2>
        {detail.triage ? (
          <div
            className={
              detail.triage.outcome === 'RED_FLAG'
                ? 'emergency-guidance'
                : undefined
            }
            role={detail.triage.outcome === 'RED_FLAG' ? 'alert' : undefined}
          >
            <p>Outcome: {fieldLabel(detail.triage.outcome)}</p>
            <p>Rule-set version: {detail.triage.ruleSetVersion}</p>
            {detail.triage.matchedRuleCodes.length ? (
              <>
                <p>Matched checks:</p>
                <TextList
                  values={detail.triage.matchedRuleCodes.map(fieldLabel)}
                />
              </>
            ) : (
              <p>No configured red-flag rule matched at the recorded check.</p>
            )}
          </div>
        ) : (
          <p>No red-flag check is recorded.</p>
        )}
        <p>
          A recorded check cannot rule out an emergency. Use clinical judgment
          and the current patient presentation.
        </p>
      </section>

      <section aria-labelledby="routing-rationale">
        <h2 id="routing-rationale">Routing rationale</h2>
        <p className="ai-unverified-notice" role="note">
          AI-assisted routing content — unverified until reviewed by the doctor.
          It is not a diagnosis or medication recommendation.
        </p>
        {routing ? (
          <dl className="appointment-detail-grid">
            <div>
              <dt>Recommended specialty</dt>
              <dd>{fieldLabel(routing.recommended_specialty)}</dd>
            </div>
            <div>
              <dt>Alternate specialty</dt>
              <dd>
                {routing.alternate_specialty
                  ? fieldLabel(routing.alternate_specialty)
                  : 'None'}
              </dd>
            </div>
            <div>
              <dt>Urgency</dt>
              <dd>{fieldLabel(routing.urgency)}</dd>
            </div>
            <div>
              <dt>Rationale for doctor</dt>
              <dd>{routing.rationale_for_doctor}</dd>
            </div>
            <div>
              <dt>Decision source</dt>
              <dd>{fieldLabel(routing.decision_source)}</dd>
            </div>
            <div>
              <dt>Missing information</dt>
              <dd>
                <TextList
                  values={routing.missing_information.map(fieldLabel)}
                />
              </dd>
            </div>
          </dl>
        ) : (
          <p>No routing rationale is associated with this appointment.</p>
        )}
      </section>

      <TranscriptPanel appointmentId={detail.id} />
    </>
  );
}
