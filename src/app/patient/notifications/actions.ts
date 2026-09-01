'use server';

import { revalidatePath } from 'next/cache';

import { updateOwnPatientNotificationPreferences } from '@/modules/notification/server';

export type NotificationPreferencesActionState = Readonly<{
  message: string;
  status: 'idle' | 'error' | 'success';
}>;

export async function updateNotificationPreferencesAction(
  _state: NotificationPreferencesActionState,
  formData: FormData,
): Promise<NotificationPreferencesActionState> {
  try {
    await updateOwnPatientNotificationPreferences({
      appointmentRemindersEnabled:
        formData.get('appointmentRemindersEnabled') === 'on',
    });
  } catch {
    return {
      message: 'Unable to update notification preferences. Try again.',
      status: 'error',
    };
  }

  revalidatePath('/patient/notifications');
  return { message: 'Notification preferences updated.', status: 'success' };
}
