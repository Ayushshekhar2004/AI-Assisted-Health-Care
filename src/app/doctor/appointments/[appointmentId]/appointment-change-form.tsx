'use client';

import { useActionState } from 'react';

import type { AppointmentRescheduleOption } from '@/modules/scheduling/server';
import { LocalSlotOption } from '../../../_components/local-slot-option';

import {
  cancelDoctorAppointmentAction,
  rescheduleDoctorAppointmentAction,
  type DoctorScheduleActionState,
} from './schedule-actions';

const initialState: DoctorScheduleActionState = { message: '', status: 'idle' };

export function DoctorAppointmentChangeForm({
  appointmentId,
  options,
}: Readonly<{
  appointmentId: string;
  options: AppointmentRescheduleOption[];
}>) {
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelDoctorAppointmentAction,
    initialState,
  );
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(
    rescheduleDoctorAppointmentAction,
    initialState,
  );
  return (
    <section
      className="appointment-change"
      aria-labelledby="change-appointment-heading"
    >
      <h2 id="change-appointment-heading">Change appointment</h2>
      <form action={cancelAction}>
        <input name="appointmentId" type="hidden" value={appointmentId} />
        <label>
          Cancellation reason
          <select name="reasonCategory" required defaultValue="">
            <option disabled value="">
              Select a reason
            </option>
            <option value="DOCTOR_UNAVAILABLE">Doctor unavailable</option>
            <option value="CLINIC_OPERATIONAL">Clinic operational issue</option>
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
              defaultValue="DOCTOR_UNAVAILABLE"
            >
              <option value="DOCTOR_UNAVAILABLE">Doctor unavailable</option>
              <option value="CLINIC_OPERATIONAL">
                Clinic operational issue
              </option>
              <option value="OTHER">Other non-clinical reason</option>
            </select>
          </label>
          <button disabled={reschedulePending} type="submit">
            {reschedulePending ? 'Rescheduling…' : 'Propose new slot'}
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
