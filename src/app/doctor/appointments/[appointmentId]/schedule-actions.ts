'use server';

import { revalidatePath } from 'next/cache';

import {
  cancelOwnAppointment,
  rescheduleOwnAppointment,
} from '@/modules/scheduling/server';

export type DoctorScheduleActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

function revalidateAppointment(appointmentId: FormDataEntryValue | null) {
  revalidatePath(`/doctor/appointments/${String(appointmentId)}`);
  revalidatePath('/doctor');
  revalidatePath('/patient/appointments');
  revalidatePath('/patient/history');
}

export async function cancelDoctorAppointmentAction(
  _state: DoctorScheduleActionState,
  formData: FormData,
): Promise<DoctorScheduleActionState> {
  try {
    await cancelOwnAppointment({
      appointmentId: formData.get('appointmentId'),
      reasonCategory: formData.get('reasonCategory'),
    });
  } catch {
    return { message: 'Unable to cancel this appointment.', status: 'error' };
  }
  revalidateAppointment(formData.get('appointmentId'));
  return { message: 'Appointment cancelled.', status: 'success' };
}

export async function rescheduleDoctorAppointmentAction(
  _state: DoctorScheduleActionState,
  formData: FormData,
): Promise<DoctorScheduleActionState> {
  try {
    await rescheduleOwnAppointment({
      appointmentId: formData.get('appointmentId'),
      availabilityId: formData.get('availabilityId'),
      reasonCategory: formData.get('reasonCategory'),
    });
  } catch {
    return {
      message: 'Unable to reschedule this appointment.',
      status: 'error',
    };
  }
  revalidateAppointment(formData.get('appointmentId'));
  return { message: 'Replacement appointment requested.', status: 'success' };
}
