'use client';
import { useActionState, useState } from 'react';
import type { ConsultationOutcome } from '@/modules/consultation';
import {
  PILOT_SPECIALTY_CODES,
  PILOT_SPECIALTY_LABELS,
} from '../../../../modules/doctor';
import {
  recordOutcomeAction,
  type OutcomeActionState,
} from './outcome-actions';
const initial: OutcomeActionState = { status: 'idle', message: '' };
export function OutcomeForm({
  appointmentId,
  noteFinalized,
  outcome,
}: Readonly<{
  appointmentId: string;
  noteFinalized: boolean;
  outcome: ConsultationOutcome | null;
}>) {
  const [selected, setSelected] = useState('TELECONSULT_COMPLETED');
  const [state, action, pending] = useActionState(recordOutcomeAction, initial);
  return (
    <section aria-labelledby="consultation-outcome">
      <h2 id="consultation-outcome">Consultation outcome</h2>
      {outcome ? (
        <dl className="appointment-detail-grid">
          <div>
            <dt>Outcome</dt>
            <dd>{outcome.outcome.replaceAll('_', ' ')}</dd>
          </div>
          {outcome.referralSpecialty ? (
            <div>
              <dt>Referral specialty</dt>
              <dd>{PILOT_SPECIALTY_LABELS[outcome.referralSpecialty]}</dd>
            </div>
          ) : null}
          {outcome.clinicLocation ? (
            <div>
              <dt>Clinic/location</dt>
              <dd>{outcome.clinicLocation}</dd>
            </div>
          ) : null}
          {outcome.locationInstructions ? (
            <div>
              <dt>Location instructions</dt>
              <dd>{outcome.locationInstructions}</dd>
            </div>
          ) : null}
          {outcome.appointmentNote ? (
            <div>
              <dt>Appointment note</dt>
              <dd>{outcome.appointmentNote}</dd>
            </div>
          ) : null}
        </dl>
      ) : noteFinalized ? (
        <form action={action} className="consultation-note-form">
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <label>
            Outcome
            <select
              name="outcome"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="TELECONSULT_COMPLETED">
                Teleconsult completed
              </option>
              <option value="FOLLOW_UP_REQUIRED">Follow-up required</option>
              <option value="REFER_SPECIALTY">
                Refer to another specialty
              </option>
              <option value="PHYSICAL_EXAM_REQUIRED">
                Physical examination required
              </option>
            </select>
          </label>
          {selected === 'REFER_SPECIALTY' ? (
            <label>
              Referral specialty
              <select name="referralSpecialty" defaultValue="" required>
                <option value="">Select specialty</option>
                {PILOT_SPECIALTY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {PILOT_SPECIALTY_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input name="referralSpecialty" type="hidden" value="" />
          )}
          {selected === 'PHYSICAL_EXAM_REQUIRED' ? (
            <>
              <label>
                Clinic/location
                <input maxLength={500} name="clinicLocation" required />
              </label>
              <label>
                Location instructions
                <textarea
                  maxLength={1000}
                  name="locationInstructions"
                  required
                />
              </label>
              <label>
                Appointment note
                <textarea maxLength={2000} name="appointmentNote" required />
              </label>
            </>
          ) : (
            <>
              <input name="clinicLocation" type="hidden" value="" />
              <input name="locationInstructions" type="hidden" value="" />
              <input name="appointmentNote" type="hidden" value="" />
            </>
          )}
          <button disabled={pending} type="submit">
            Record consultation outcome
          </button>
          {state.message ? <p role="status">{state.message}</p> : null}
        </form>
      ) : (
        <p>
          Finalize the doctor consultation note before recording an outcome.
        </p>
      )}
    </section>
  );
}
