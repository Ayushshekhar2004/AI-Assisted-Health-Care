'use server';
import { revalidatePath } from 'next/cache';
import { recordConsultationOutcome } from '@/modules/consultation/outcome-server';
export type OutcomeActionState = Readonly<{
  status: 'idle' | 'success' | 'error';
  message: string;
}>;
export async function recordOutcomeAction(
  _state: OutcomeActionState,
  formData: FormData,
): Promise<OutcomeActionState> {
  try {
    await recordConsultationOutcome({
      appointmentId: formData.get('appointmentId'),
      outcome: formData.get('outcome'),
      referralSpecialty: formData.get('referralSpecialty'),
      clinicLocation: formData.get('clinicLocation'),
      locationInstructions: formData.get('locationInstructions'),
      appointmentNote: formData.get('appointmentNote'),
    });
    revalidatePath(
      `/doctor/appointments/${String(formData.get('appointmentId'))}`,
    );
    revalidatePath('/patient/appointments');
    return { status: 'success', message: 'Consultation outcome recorded.' };
  } catch {
    return {
      status: 'error',
      message: 'The consultation outcome could not be recorded.',
    };
  }
}
