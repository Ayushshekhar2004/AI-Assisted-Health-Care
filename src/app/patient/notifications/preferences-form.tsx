'use client';

import { useActionState } from 'react';

import {
  updateNotificationPreferencesAction,
  type NotificationPreferencesActionState,
} from './actions';

const initialState: NotificationPreferencesActionState = {
  message: '',
  status: 'idle',
};

export function NotificationPreferencesForm({
  appointmentRemindersEnabled,
}: Readonly<{ appointmentRemindersEnabled: boolean }>) {
  const [state, action, pending] = useActionState(
    updateNotificationPreferencesAction,
    initialState,
  );

  return (
    <form action={action}>
      <label>
        <input
          defaultChecked={appointmentRemindersEnabled}
          name="appointmentRemindersEnabled"
          type="checkbox"
        />{' '}
        Send appointment reminders
      </label>
      <p>
        You can opt out of reminders. Appointment confirmations, cancellations,
        and doctor-ready notices are essential logistics and will still be sent.
      </p>
      <button disabled={pending} type="submit">
        {pending ? 'Saving…' : 'Save preferences'}
      </button>
      <p aria-live="polite" role="status">
        {state.message}
      </p>
    </form>
  );
}
