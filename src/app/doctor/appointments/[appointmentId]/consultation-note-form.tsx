'use client';

import { useActionState } from 'react';

import type { ConsultationNote } from '@/modules/consultation';

import {
  finalizeConsultationAction,
  generateConsultationAIDraftAction,
  saveConsultationDraftAction,
  type ConsultationNoteActionState,
} from './consultation-actions';

const initialState: ConsultationNoteActionState = {
  status: 'idle',
  message: '',
};

export function ConsultationNoteForm({
  appointmentId,
  appointmentStatus,
  note,
}: Readonly<{
  appointmentId: string;
  appointmentStatus: string;
  note: ConsultationNote | null;
}>) {
  const [draftState, saveDraft, draftPending] = useActionState(
    saveConsultationDraftAction,
    initialState,
  );
  const [finalState, finalize, finalPending] = useActionState(
    finalizeConsultationAction,
    initialState,
  );
  const [aiState, generateAIDraft, aiPending] = useActionState(
    generateConsultationAIDraftAction,
    initialState,
  );
  const finalized = note?.status === 'FINALIZED';
  const editable = appointmentStatus === 'IN_PROGRESS' && !finalized;
  const state =
    finalState.status !== 'idle'
      ? finalState
      : aiState.status !== 'idle'
        ? aiState
        : draftState;

  return (
    <section aria-labelledby="consultation-note">
      <h2 id="consultation-note">Doctor consultation note</h2>
      <p>
        Clinician-authored record. Finalization is irreversible and shares the
        note with the assigned patient.
      </p>
      <form action={saveDraft} className="consultation-note-form">
        <input name="appointmentId" type="hidden" value={appointmentId} />
        {editable ? (
          <fieldset>
            <legend>Optional AI structure draft</legend>
            <p className="ai-unverified-notice" role="note">
              AI output is unverified. It cannot finalize this note, make the
              telemedicine decision, issue a diagnosis, or prescribe. Review and
              edit every generated section.
            </p>
            <label>
              Doctor-entered points for the draft
              <textarea maxLength={4000} name="doctorPoints" rows={4} />
            </label>
            <label>
              <input name="intakeReviewed" type="checkbox" />I have reviewed the
              patient intake used for this draft.
            </label>
            <button
              disabled={draftPending || finalPending || aiPending}
              formAction={generateAIDraft}
              type="submit"
            >
              Generate optional AI draft
            </button>
          </fieldset>
        ) : null}
        {note?.aiDraftGeneratedAt ? (
          <p className="ai-unverified-notice" role="note">
            This note began as an AI-generated draft and requires explicit
            doctor review and editing.
          </p>
        ) : null}
        <label>
          Subjective history
          <textarea
            defaultValue={note?.subjectiveHistory ?? ''}
            disabled={!editable}
            maxLength={8000}
            name="subjectiveHistory"
            rows={5}
          />
        </label>
        <label>
          Examination limitations and observations
          <textarea
            defaultValue={note?.examinationObservations ?? ''}
            disabled={!editable}
            maxLength={8000}
            name="examinationObservations"
            rows={5}
          />
        </label>
        <label>
          Assessment
          <textarea
            defaultValue={note?.assessment ?? ''}
            disabled={!editable}
            maxLength={8000}
            name="assessment"
            rows={5}
          />
        </label>
        <label>
          Plan
          <textarea
            defaultValue={note?.plan ?? ''}
            disabled={!editable}
            maxLength={8000}
            name="plan"
            rows={5}
          />
        </label>
        <label>
          Follow-up
          <textarea
            defaultValue={note?.followUp ?? ''}
            disabled={!editable}
            maxLength={4000}
            name="followUp"
            rows={3}
          />
        </label>
        <label>
          Telemedicine adequacy decision
          <select
            defaultValue={note?.telemedicineAdequacy ?? ''}
            disabled={!editable}
            name="telemedicineAdequacy"
          >
            <option value="">Select a decision</option>
            <option value="ADEQUATE">Adequate for telemedicine</option>
            <option value="REQUIRES_IN_PERSON">Requires in-person care</option>
          </select>
        </label>
        {editable ? (
          <div className="form-actions">
            <button
              disabled={draftPending || finalPending || aiPending}
              type="submit"
            >
              Save draft
            </button>
            <button
              disabled={draftPending || finalPending || aiPending}
              formAction={finalize}
              type="submit"
            >
              Finalize and close consultation
            </button>
          </div>
        ) : (
          <p>
            {finalized
              ? `This note was finalized by the assigned doctor${note.finalizedAt ? ` at ${new Date(note.finalizedAt).toLocaleString()}` : ''} and cannot be edited.`
              : 'Start the appointment before creating the consultation note.'}
          </p>
        )}
        {state.message ? (
          <p aria-live="polite" role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
