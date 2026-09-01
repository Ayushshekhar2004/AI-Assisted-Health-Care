'use client';

import { useActionState } from 'react';

import { LocalSlotOption } from '../../_components/local-slot-option';
import type { FollowUpRecommendation } from '@/modules/consultation';
import type { FollowUpBookingOption } from '@/modules/scheduling/server';

import { bookFollowUpAction, type BookingActionState } from './actions';

const initialState: BookingActionState = { message: '', status: 'idle' };
const timingLabels = {
  WITHIN_7_DAYS: 'within 7 days',
  WITHIN_14_DAYS: 'within 14 days',
  WITHIN_30_DAYS: 'within 30 days',
  AS_NEEDED: 'as needed',
} as const;

export function FollowUpBooking({
  options,
  recommendation,
}: Readonly<{
  options: FollowUpBookingOption[];
  recommendation: FollowUpRecommendation;
}>) {
  const [state, action, pending] = useActionState(
    bookFollowUpAction,
    initialState,
  );
  return (
    <section className="appointment-change" aria-label="Follow-up rebooking">
      <h4>Doctor follow-up recommendation</h4>
      <p>
        {recommendation.doctorName} recommended follow-up{' '}
        {timingLabels[recommendation.timing]}.
      </p>
      {recommendation.bookedAppointmentId ? (
        <p>A follow-up appointment has already been requested.</p>
      ) : options.length > 0 ? (
        <form action={action}>
          <input
            name="recommendationId"
            type="hidden"
            value={recommendation.id}
          />
          <label>
            Available follow-up slot
            <select name="availabilityId" required defaultValue="">
              <option disabled value="">
                Select a slot
              </option>
              {options.map((option) => (
                <LocalSlotOption
                  endsAt={option.endsAt}
                  id={option.id}
                  key={option.id}
                  startsAt={option.startsAt}
                />
              ))}
            </select>
          </label>
          <p>
            This starts a new appointment. Your prior prescription and intake
            will not be copied, and you should describe your current concern.
          </p>
          <button disabled={pending} type="submit">
            {pending ? 'Requesting…' : 'Request follow-up slot'}
          </button>
          <p aria-live="polite" role="status">
            {state.message}
          </p>
        </form>
      ) : (
        <p>No follow-up slots are currently available.</p>
      )}
    </section>
  );
}
