'use client';

import { useActionState } from 'react';

import type { AppointmentRescheduleOption } from '@/modules/scheduling/server';
import { LocalSlotOption } from '../../_components/local-slot-option';

import {
  cancelPatientAppointmentAction,
  reschedulePatientAppointmentAction,
  type AppointmentChangeActionState,
} from './actions';

const initialState: AppointmentChangeActionState = {
  message: '',
  status: 'idle',
};

export function PatientAppointmentChangeForm({
  appointmentId,
  options,
}: Readonly<{
  appointmentId: string;
  options: AppointmentRescheduleOption[];
}>) {
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelPatientAppointmentAction,
    initialState,
  );
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(
    reschedulePatientAppointmentAction,
    initialState,
  );

  return (
    <section className="appointment-change" aria-label="Change appointment">
      <form action={cancelAction}>
        <input name="appointmentId" type="hidden" value={appointmentId} />
        <label>
          Cancellation reason
          <select name="reasonCategory" required defaultValue="">
            <option disabled value="">
              Select a reason
            </option>
            <option value="PATIENT_SCHEDULE_CONFLICT">Schedule conflict</option>
            <option value="CARE_NO_LONGER_NEEDED">Care no longer needed</option>
            <option value="OTHER">Other non-clinical reason</option>
          </select>
        </label>
        <button disabled={cancelPending} type="submit">
          {cancelPending ? 'Cancelling…' : 'Cancel appointment'}
        </button>
        <p aria-live="polite" role="status">
          {cancelState.message}
        </p>
      </form>

      {options.length > 0 ? (
        <form action={rescheduleAction}>
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <label>
            New slot
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
          <label>
            Reschedule reason
            <select
              name="reasonCategory"
              required
              defaultValue="PATIENT_SCHEDULE_CONFLICT"
            >
              <option value="PATIENT_SCHEDULE_CONFLICT">
                Schedule conflict
              </option>
              <option value="OTHER">Other non-clinical reason</option>
            </select>
          </label>
          <button disabled={reschedulePending} type="submit">
            {reschedulePending ? 'Rescheduling…' : 'Request new slot'}
          </button>
          <p aria-live="polite" role="status">
            {rescheduleState.message}
          </p>
        </form>
      ) : (
        <p>No alternative slots are currently available.</p>
      )}
    </section>
  );
}
