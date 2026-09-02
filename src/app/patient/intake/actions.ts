'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { addIntakeMessage, startIntakeSession } from '@/modules/intake/server';
import { EMERGENCY_SCREENING_QUESTIONS } from '@/modules/triage';
import { evaluateEmergencyScreening } from '@/modules/triage/server';

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
    const mode = await addIntakeMessage(
      formData.get('sessionId'),
      formData.get('message'),
    );
    revalidatePath('/patient/intake');
    if (mode === 'MANUAL_FALLBACK') {
      return {
        message:
          'Your response was saved for manual clinician review. AI assistance is unavailable, so routing will use General Medicine.',
        status: 'success',
      };
    }
  } catch {
    return { message: genericIntakeError, status: 'error' };
  }

  revalidatePath('/patient/intake');
  return { message: 'Response recorded.', status: 'success' };
}

export async function submitEmergencyScreeningAction(
  _state: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  let redFlagDetected = false;
  try {
    const answers = EMERGENCY_SCREENING_QUESTIONS.map((question) => ({
      questionId: question.id,
      answer: formData.get(`answer_${question.id}`),
    }));
    redFlagDetected = Boolean(
      await evaluateEmergencyScreening(formData.get('sessionId'), answers),
    );
  } catch {
    return {
      message:
        'Unable to complete the safety check. Review every answer and try again.',
      status: 'error',
    };
  }

  if (redFlagDetected) redirect('/patient/emergency');
  revalidatePath('/patient/intake');
  return {
    message: 'Safety check recorded. You may continue the intake.',
    status: 'success',
  };
}
