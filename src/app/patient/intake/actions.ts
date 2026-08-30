'use server';

import { revalidatePath } from 'next/cache';

import { addIntakeMessage, startIntakeSession } from '@/modules/intake/server';

export type IntakeActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

const genericIntakeError =
  'Unable to update intake. Review your response and try again.';

export async function startIntakeAction(): Promise<void> {
  try {
    await startIntakeSession();
  } catch {
    return;
  }
  revalidatePath('/patient/intake');
}

export async function sendIntakeMessageAction(
  _state: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  try {
    await addIntakeMessage(formData.get('sessionId'), formData.get('message'));
  } catch {
    return { message: genericIntakeError, status: 'error' };
  }

  revalidatePath('/patient/intake');
  return { message: 'Response recorded.', status: 'success' };
}
