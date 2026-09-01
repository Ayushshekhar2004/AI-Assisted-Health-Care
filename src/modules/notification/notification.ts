import { z } from 'zod';

export const notificationEventTypeSchema = z.enum([
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CANCELLED',
  'DOCTOR_READY',
]);

export const notificationContentSchema = z
  .object({
    subject: z.string().trim().min(1).max(80),
    preview: z.string().trim().min(1).max(160),
  })
  .strict();

export const notificationDeliverySchema = z
  .object({
    eventId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    recipientProfileId: z.string().uuid(),
    type: notificationEventTypeSchema,
    content: notificationContentSchema,
  })
  .strict();

export const notificationEventSchema = z
  .object({
    id: z.string().uuid(),
    appointmentId: z.string().uuid(),
    recipientProfileId: z.string().uuid(),
    type: notificationEventTypeSchema,
    scheduledFor: z.string().datetime({ offset: true }),
  })
  .strict();

export type NotificationContent = z.infer<typeof notificationContentSchema>;
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

export const patientNotificationPreferencesSchema = z
  .object({
    appointmentRemindersEnabled: z.boolean(),
  })
  .strict();

export type PatientNotificationPreferences = z.infer<
  typeof patientNotificationPreferencesSchema
>;

export function isEssentialNotification(type: NotificationEventType): boolean {
  return type !== 'APPOINTMENT_REMINDER';
}

const appointmentNotificationContent: Record<
  NotificationEventType,
  NotificationContent
> = {
  APPOINTMENT_CONFIRMED: {
    subject: 'Appointment confirmed',
    preview:
      'Your appointment is confirmed. Open the app for scheduling details.',
  },
  APPOINTMENT_REMINDER: {
    subject: 'Appointment reminder',
    preview:
      'You have an upcoming appointment. Open the app for scheduling details.',
  },
  APPOINTMENT_CANCELLED: {
    subject: 'Appointment cancelled',
    preview:
      'An appointment was cancelled. Open the app for scheduling details.',
  },
  DOCTOR_READY: {
    subject: 'Doctor ready',
    preview: 'Your doctor is ready. Open the app to join your appointment.',
  },
};

export function getAppointmentNotificationContent(
  type: NotificationEventType,
): NotificationContent {
  return notificationContentSchema.parse(appointmentNotificationContent[type]);
}
