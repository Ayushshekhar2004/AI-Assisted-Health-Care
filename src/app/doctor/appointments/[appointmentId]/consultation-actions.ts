'use server';

import { revalidatePath } from 'next/cache';

import {
  finalizeConsultationNote,
  generateAndStoreConsultationAIDraft,
  saveConsultationDraft,
} from '@/modules/consultation/server';

export type ConsultationNoteActionState = Readonly<{
  status: 'idle' | 'success' | 'error';
  message: string;
}>;

function inputFrom(formData: FormData) {
  return {
    appointmentId: formData.get('appointmentId'),
    subjectiveHistory: formData.get('subjectiveHistory'),
    examinationObservations: formData.get('examinationObservations'),
    assessment: formData.get('assessment'),
    plan: formData.get('plan'),
    followUp: formData.get('followUp'),
    telemedicineAdequacy: formData.get('telemedicineAdequacy'),
  };
}

export async function generateConsultationAIDraftAction(
  _state: ConsultationNoteActionState,
  formData: FormData,
): Promise<ConsultationNoteActionState> {
  try {
    await generateAndStoreConsultationAIDraft({
      appointmentId: formData.get('appointmentId'),
      doctorPoints: formData.get('doctorPoints'),
      intakeReviewed: formData.get('intakeReviewed') === 'on',
    });
    revalidatePath(
      `/doctor/appointments/${String(formData.get('appointmentId'))}`,
    );
    return {
      status: 'success',
      message:
        'AI draft generated. Review and edit every section before finalizing.',
    };
  } catch {
    return {
      status: 'error',
      message: 'The optional AI draft is unavailable.',
    };
  }
}

export async function saveConsultationDraftAction(
  _state: ConsultationNoteActionState,
  formData: FormData,
): Promise<ConsultationNoteActionState> {
  try {
    await saveConsultationDraft(inputFrom(formData));
    revalidatePath(
      `/doctor/appointments/${String(formData.get('appointmentId'))}`,
    );
    return { status: 'success', message: 'Draft saved.' };
  } catch {
    return {
      status: 'error',
      message: 'The consultation draft could not be saved.',
    };
  }
}

export async function finalizeConsultationAction(
  _state: ConsultationNoteActionState,
  formData: FormData,
): Promise<ConsultationNoteActionState> {
  try {
    await finalizeConsultationNote(inputFrom(formData));
    revalidatePath(
      `/doctor/appointments/${String(formData.get('appointmentId'))}`,
    );
    revalidatePath('/doctor');
    revalidatePath('/patient/appointments');
    return { status: 'success', message: 'Consultation note finalized.' };
  } catch {
    return {
      status: 'error',
      message: 'The consultation note is incomplete or cannot be finalized.',
    };
  }
}
