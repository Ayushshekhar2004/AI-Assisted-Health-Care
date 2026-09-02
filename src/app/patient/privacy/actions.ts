'use server';

import { revalidatePath } from 'next/cache';

import { recordOwnConsentDecision } from '@/modules/patient/consent-server';

export type ConsentActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

export async function recordConsentDecisionAction(
  _state: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  try {
    await recordOwnConsentDecision({
      purpose: formData.get('purpose'),
      status: formData.get('status'),
    });
  } catch {
    return {
      message:
        'Unable to update this consent. An active workflow may still require it.',
      status: 'error',
    };
  }
  revalidatePath('/patient/privacy');
  return { message: 'Consent decision recorded.', status: 'success' };
}
