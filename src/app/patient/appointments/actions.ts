'use server';

import { revalidatePath } from 'next/cache';

import { bookAvailability } from '@/modules/scheduling/server';

export type BookingActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

const genericBookingError =
  'Unable to request this appointment. It may no longer be available.';

export async function bookAvailabilityAction(
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  try {
    // The browser supplies only an opaque slot ID. Patient, doctor, times, and fee are
    // derived again inside the authenticated database transaction.
    await bookAvailability(formData.get('availabilityId'));
  } catch {
    return { message: genericBookingError, status: 'error' };
  }

  revalidatePath('/patient/appointments');
  revalidatePath('/doctor/availability');
  return { message: 'Appointment requested.', status: 'success' };
}
