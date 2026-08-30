'use client';

import { useActionState } from 'react';

import { bookAvailabilityAction, type BookingActionState } from './actions';

const initialState: BookingActionState = { message: '', status: 'idle' };

export function BookingForm({
  availabilityId,
}: Readonly<{ availabilityId: string }>) {
  const [state, formAction, pending] = useActionState(
    bookAvailabilityAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <input name="availabilityId" type="hidden" value={availabilityId} />
      <button disabled={pending} type="submit">
        {pending ? 'Requesting…' : 'Request appointment'}
      </button>
      <p aria-live="polite" className="auth-message" role="status">
        {state.message}
      </p>
    </form>
  );
}
