'use server';

import {
  generateAndStoreDoctorHandoff,
  markDoctorHandoffItemInaccurate,
  type StoredDoctorHandoff,
} from '@/modules/consultation/server';

export type HandoffActionState = Readonly<{
  status: 'idle' | 'success' | 'error';
  message: string;
  handoff: StoredDoctorHandoff | null;
}>;

export async function generateDoctorHandoffAction(
  _state: HandoffActionState,
  formData: FormData,
): Promise<HandoffActionState> {
  try {
    const handoff = await generateAndStoreDoctorHandoff(
      formData.get('appointmentId'),
    );
    return { status: 'success', message: '', handoff };
  } catch {
    return {
      status: 'error',
      message: 'The doctor handoff is unavailable.',
      handoff: null,
    };
  }
}

export type HandoffFeedbackActionState = Readonly<{
  status: 'idle' | 'success' | 'error';
  message: string;
}>;

export async function markHandoffItemInaccurateAction(
  _state: HandoffFeedbackActionState,
  formData: FormData,
): Promise<HandoffFeedbackActionState> {
  try {
    await markDoctorHandoffItemInaccurate(
      formData.get('appointmentId'),
      formData.get('summaryVersion'),
      formData.get('itemKey'),
    );
    return {
      status: 'success',
      message:
        'Marked inaccurate for later evaluation. The original is unchanged.',
    };
  } catch {
    return {
      status: 'error',
      message: 'The handoff feedback could not be recorded.',
    };
  }
}
