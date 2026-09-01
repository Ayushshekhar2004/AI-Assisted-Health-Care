'use client';

import { useActionState } from 'react';

import type { FollowUpRecommendation } from '@/modules/consultation';

import {
  createFollowUpRecommendationAction,
  type FollowUpActionState,
} from './follow-up-actions';

const initialState: FollowUpActionState = { message: '', status: 'idle' };

const timingLabels = {
  WITHIN_7_DAYS: 'Within 7 days',
  WITHIN_14_DAYS: 'Within 14 days',
  WITHIN_30_DAYS: 'Within 30 days',
  AS_NEEDED: 'As needed',
} as const;

export function FollowUpRecommendationForm({
  appointmentId,
  outcome,
  recommendation,
}: Readonly<{
  appointmentId: string;
  outcome: string | null;
  recommendation: FollowUpRecommendation | null;
}>) {
  const [state, action, pending] = useActionState(
    createFollowUpRecommendationAction,
    initialState,
  );
  if (outcome !== 'FOLLOW_UP_REQUIRED') return null;
  return (
    <section aria-labelledby="follow-up-recommendation-heading">
      <h2 id="follow-up-recommendation-heading">Follow-up recommendation</h2>
      {recommendation ? (
        <p>
          Recommended timing: {timingLabels[recommendation.timing]}.{' '}
          {recommendation.bookedAppointmentId
            ? 'The patient has requested a follow-up appointment.'
            : 'The patient can choose an available slot.'}
        </p>
      ) : (
        <form action={action} className="consultation-note-form">
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <label>
            Recommended timing
            <select name="timing" defaultValue="WITHIN_14_DAYS" required>
              {Object.entries(timingLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p>
            This creates a booking recommendation only. It does not copy the
            prior intake, notes, or prescription into a new appointment.
          </p>
          <button disabled={pending} type="submit">
            {pending ? 'Creating…' : 'Create follow-up recommendation'}
          </button>
          <p aria-live="polite" role="status">
            {state.message}
          </p>
        </form>
      )}
    </section>
  );
}
