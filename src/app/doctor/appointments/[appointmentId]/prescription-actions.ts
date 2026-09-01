'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prescriptionItemInputSchema } from '@/modules/prescription';
import { savePrescription } from '@/modules/prescription/server';

export type PrescriptionActionState = Readonly<{
  status: 'idle' | 'success' | 'error';
  message: string;
}>;

function parse(formData: FormData) {
  const rawItems = JSON.parse(String(formData.get('items') ?? '[]')) as unknown;
  return {
    appointmentId: formData.get('appointmentId'),
    followUp: formData.get('followUp'),
    items: z.array(prescriptionItemInputSchema).max(50).parse(rawItems),
  };
}

export async function savePrescriptionDraftAction(
  _state: PrescriptionActionState,
  formData: FormData,
): Promise<PrescriptionActionState> {
  try {
    await savePrescription(parse(formData), false);
    revalidatePath(
      `/doctor/appointments/${String(formData.get('appointmentId'))}`,
    );
    return { status: 'success', message: 'Prescription draft saved.' };
  } catch {
    return {
      status: 'error',
      message: 'The prescription draft could not be saved.',
    };
  }
}

export async function finalizePrescriptionAction(
  _state: PrescriptionActionState,
  formData: FormData,
): Promise<PrescriptionActionState> {
  try {
    await savePrescription(parse(formData), true);
    revalidatePath(
      `/doctor/appointments/${String(formData.get('appointmentId'))}`,
    );
    revalidatePath('/patient/appointments');
    return {
      status: 'success',
      message: 'Prescription finalized and shared with the patient.',
    };
  } catch {
    return {
      status: 'error',
      message:
        'The prescription cannot be finalized. Complete and review it first.',
    };
  }
}
