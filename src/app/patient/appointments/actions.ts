'use server';

import { revalidatePath } from 'next/cache';

import { bookAvailability } from '@/modules/scheduling/server';
import { uploadOwnPatientDocument } from '@/modules/patient/document-server';
import { getActiveRedFlag } from '@/modules/triage/server';

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
    if (await getActiveRedFlag()) {
      return {
        message:
          'Online appointment routing is paused. Follow the emergency pathway now.',
        status: 'error',
      };
    }
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

export type DocumentUploadActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

export async function uploadDocumentAction(
  _state: DocumentUploadActionState,
  formData: FormData,
): Promise<DocumentUploadActionState> {
  try {
    const file = formData.get('document');
    if (!(file instanceof File)) throw new Error('Missing file');
    await uploadOwnPatientDocument(formData.get('appointmentId'), file);
  } catch {
    return {
      message: 'Unable to upload this document. Check its type and size.',
      status: 'error',
    };
  }
  revalidatePath('/patient/appointments');
  return { message: 'Document uploaded privately.', status: 'success' };
}
