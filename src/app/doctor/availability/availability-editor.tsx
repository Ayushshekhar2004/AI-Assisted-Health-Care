'use client';

import { useActionState } from 'react';

import { LocalDateTime } from '@/app/_components/local-date-time';
import type { DoctorAvailability } from '@/modules/scheduling/server';

import {
  createAvailabilityAction,
  deleteAvailabilityAction,
  type AvailabilityActionState,
} from './actions';

const initialState: AvailabilityActionState = { message: '', status: 'idle' };

export function AvailabilityEditor({
  slots,
}: Readonly<{ slots: DoctorAvailability[] }>) {
  async function localTimeAction(
    state: AvailabilityActionState,
    formData: FormData,
  ): Promise<AvailabilityActionState> {
    const startsAt = new Date(String(formData.get('startsAtLocal') ?? ''));
    const endsAt = new Date(String(formData.get('endsAtLocal') ?? ''));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { message: 'Enter a valid start and end time.', status: 'error' };
    }

    formData.set('startsAtIso', startsAt.toISOString());
    formData.set('endsAtIso', endsAt.toISOString());
    formData.delete('startsAtLocal');
    formData.delete('endsAtLocal');
    return createAvailabilityAction(state, formData);
  }

  const [state, formAction, pending] = useActionState(
    localTimeAction,
    initialState,
  );

  return (
    <>
      <form action={formAction} className="auth-form">
        <label>
          Starts in your timezone
          <input name="startsAtLocal" required type="datetime-local" />
        </label>
        <label>
          Ends in your timezone
          <input name="endsAtLocal" required type="datetime-local" />
        </label>
        <button disabled={pending} type="submit">
          {pending ? 'Adding…' : 'Add availability'}
        </button>
        <p aria-live="polite" className="auth-message" role="status">
          {state.message}
        </p>
      </form>

      <section aria-labelledby="upcoming-availability">
        <h2 id="upcoming-availability">Upcoming availability</h2>
        {slots.length === 0 ? <p>No upcoming availability.</p> : null}
        <ul className="scheduling-list">
          {slots.map((slot) => (
            <li key={slot.id}>
              <LocalDateTime endsAt={slot.endsAt} startsAt={slot.startsAt} />
              <form action={deleteAvailabilityAction}>
                <input name="availabilityId" type="hidden" value={slot.id} />
                <button type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
