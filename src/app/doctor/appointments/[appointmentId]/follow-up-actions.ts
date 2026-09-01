'use server';

import { revalidatePath } from 'next/cache';

import { createFollowUpRecommendation } from '@/modules/consultation/follow-up-server';

export type FollowUpActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

export async function createFollowUpRecommendationAction(
  _state: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  try {
    await createFollowUpRecommendation({
      appointmentId: formData.get('appointmentId'),
      timing: formData.get('timing'),
    });
  } catch {
    return {
      message: 'Unable to create the follow-up recommendation.',
      status: 'error',
    };
  }
  const appointmentId = String(formData.get('appointmentId'));
  revalidatePath(`/doctor/appointments/${appointmentId}`);
  revalidatePath('/patient/appointments');
  return { message: 'Follow-up recommendation created.', status: 'success' };
}
