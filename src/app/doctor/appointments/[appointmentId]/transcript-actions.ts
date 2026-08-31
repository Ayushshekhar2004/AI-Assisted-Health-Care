'use server';

import {
  getDoctorAppointmentTranscript,
  type DoctorAppointmentTranscriptMessage,
} from '@/modules/consultation/server';

export type TranscriptActionState = Readonly<{
  status: 'idle' | 'success' | 'error';
  message: string;
  messages: DoctorAppointmentTranscriptMessage[];
}>;

export async function expandAppointmentTranscriptAction(
  _state: TranscriptActionState,
  formData: FormData,
): Promise<TranscriptActionState> {
  try {
    const messages = await getDoctorAppointmentTranscript(
      formData.get('appointmentId'),
    );
    return { status: 'success', message: '', messages };
  } catch {
    return {
      status: 'error',
      message: 'The transcript is unavailable.',
      messages: [],
    };
  }
}
