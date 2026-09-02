'use server';

import { revalidatePath } from 'next/cache';

import { transitionPrivacyRequest } from '@/modules/patient/privacy-request-server';

export type PrivacyReviewActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

export async function transitionPrivacyRequestAction(
  _state: PrivacyReviewActionState,
  formData: FormData,
): Promise<PrivacyReviewActionState> {
  try {
    await transitionPrivacyRequest({
      nextStatus: formData.get('nextStatus'),
      requestId: formData.get('requestId'),
      resolutionCategory: formData.get('resolutionCategory') ?? '',
    });
  } catch {
    return {
      message:
        'Unable to update this request. Review the transition and try again.',
      status: 'error',
    };
  }
  revalidatePath('/admin/privacy-requests');
  return { message: 'Privacy request updated.', status: 'success' };
}
