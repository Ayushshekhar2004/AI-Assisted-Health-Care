'use server';

import { revalidatePath } from 'next/cache';

import { recordOwnConsentDecision } from '@/modules/patient/consent-server';
import { submitOwnPrivacyRequest } from '@/modules/patient/privacy-request-server';

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

export async function submitPrivacyRequestAction(
  _state: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  try {
    await submitOwnPrivacyRequest({
      details: formData.get('details'),
      requestType: formData.get('requestType'),
    });
  } catch {
    return {
      message:
        'Unable to submit this privacy request. Review it and try again.',
      status: 'error',
    };
  }
  revalidatePath('/patient/privacy');
  return {
    message: 'Request queued for reviewed processing.',
    status: 'success',
  };
}
