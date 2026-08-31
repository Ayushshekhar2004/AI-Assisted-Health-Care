'use client';

import { useActionState } from 'react';

import type { DoctorAppointmentTranscriptMessage } from '@/modules/consultation/server';

import { LocalDateTime } from '../../../_components/local-date-time';
import {
  expandAppointmentTranscriptAction,
  type TranscriptActionState,
} from './transcript-actions';

const initialState: TranscriptActionState = {
  status: 'idle',
  message: '',
  messages: [],
};

export function TranscriptMessages({
  messages,
}: Readonly<{ messages: DoctorAppointmentTranscriptMessage[] }>) {
  return (
    <ol className="appointment-transcript">
      {messages.map((message) => (
        <li key={message.id}>
          <p className="intake-message-role">
            {message.role === 'patient'
              ? 'Patient-provided'
              : 'AI intake assistant — unverified'}
          </p>
          <p>{message.text}</p>
          <small>
            <LocalDateTime startsAt={message.createdAt} />
          </small>
        </li>
      ))}
    </ol>
  );
}

export function TranscriptPanel({
  appointmentId,
}: Readonly<{ appointmentId: string }>) {
  const [state, formAction, pending] = useActionState(
    expandAppointmentTranscriptAction,
    initialState,
  );
  const expanded = state.status === 'success';

  return (
    <section aria-labelledby="intake-transcript">
      <h2 id="intake-transcript">Intake transcript</h2>
      <p>
        The transcript contains sensitive patient-provided text. Expand it only
        when needed for this appointment.
      </p>
      {!expanded ? (
        <form action={formAction}>
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <button aria-expanded="false" disabled={pending} type="submit">
            {pending ? 'Loading transcript…' : 'Expand transcript'}
          </button>
        </form>
      ) : state.messages.length === 0 ? (
        <p aria-live="polite">
          No intake transcript is associated with this appointment.
        </p>
      ) : (
        <TranscriptMessages messages={state.messages} />
      )}
      {state.status === 'error' ? (
        <p aria-live="polite" className="auth-message" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
