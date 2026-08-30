'use server';

import { revalidatePath } from 'next/cache';

import {
  createDoctorAvailability,
  deleteDoctorAvailability,
} from '@/modules/scheduling/server';

export type AvailabilityActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

const genericAvailabilityError =
  'Unable to update availability. Check the time and try again.';

export async function createAvailabilityAction(
  _state: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  try {
    await createDoctorAvailability({
      startsAtIso: String(formData.get('startsAtIso') ?? ''),
      endsAtIso: String(formData.get('endsAtIso') ?? ''),
    });
  } catch {
    return { message: genericAvailabilityError, status: 'error' };
  }

  revalidatePath('/doctor/availability');
  revalidatePath('/patient/appointments');
  return { message: 'Availability added.', status: 'success' };
}

export async function deleteAvailabilityAction(
  formData: FormData,
): Promise<void> {
  try {
    await deleteDoctorAvailability(formData.get('availabilityId'));
  } catch {
    return;
  }
  revalidatePath('/doctor/availability');
  revalidatePath('/patient/appointments');
}
