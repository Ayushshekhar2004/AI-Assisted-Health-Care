import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getSupabaseAdminConfig } from '@/lib/supabase/admin-config';
import { createClient } from '@/lib/supabase/server';

import {
  getAppointmentNotificationContent,
  notificationDeliverySchema,
  notificationEventSchema,
  patientNotificationPreferencesSchema,
} from './notification';
import { createNotificationProvider } from './provider-factory';

const appointmentIdSchema = z.string().uuid();
const providerMessageIdSchema = z.string().trim().min(1).max(160);

type NotificationEventRow = Readonly<{
  appointment_id: unknown;
  event_type: unknown;
  id: unknown;
  recipient_profile_id: unknown;
  scheduled_for: unknown;
}>;

function createPrivilegedClient() {
  const { secretKey, url } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseEvent(row: NotificationEventRow) {
  return notificationEventSchema.parse({
    id: row.id,
    appointmentId: row.appointment_id,
    recipientProfileId: row.recipient_profile_id,
    type: row.event_type,
    scheduledFor: row.scheduled_for,
  });
}

export async function dispatchNotificationEventsForAppointment(
  untrustedAppointmentId: unknown,
): Promise<void> {
  const appointmentId = appointmentIdSchema.parse(untrustedAppointmentId);
  await dispatchClaimedEvents(appointmentId);
}

export async function dispatchDueNotificationEvents(): Promise<void> {
  await dispatchClaimedEvents(null);
}

async function dispatchClaimedEvents(
  appointmentId: string | null,
): Promise<void> {
  // Validate provider availability before claiming so a deployment
  // misconfiguration cannot strand events in PROCESSING.
  const provider = createNotificationProvider();
  const privileged = createPrivilegedClient();
  const { data, error } = await privileged.rpc('claim_notification_events', {
    p_appointment_id: appointmentId,
    p_limit: 50,
  });
  if (error) throw new Error('Notifications are unavailable');

  const events = z
    .array(z.unknown())
    .parse(data ?? [])
    .map((row) => parseEvent(row as NotificationEventRow));

  for (const event of events) {
    try {
      const delivery = notificationDeliverySchema.parse({
        eventId: event.id,
        idempotencyKey: event.id,
        recipientProfileId: event.recipientProfileId,
        type: event.type,
        content: getAppointmentNotificationContent(event.type),
      });
      const result = await provider.send(delivery);
      await finishEvent(
        privileged,
        event.id,
        true,
        providerMessageIdSchema.parse(result.providerMessageId),
        null,
      );
    } catch {
      await finishEvent(privileged, event.id, false, null, 'PROVIDER_ERROR');
    }
  }
}

export async function getOwnPatientNotificationPreferences() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Notification preferences are unavailable');
  }

  const { data, error } = await supabase
    .from('patient_notification_preferences')
    .select('appointment_reminders_enabled')
    .maybeSingle();
  if (error || !data) {
    throw new Error('Notification preferences are unavailable');
  }

  return patientNotificationPreferencesSchema.parse({
    appointmentRemindersEnabled: data.appointment_reminders_enabled,
  });
}

export async function updateOwnPatientNotificationPreferences(
  untrustedInput: unknown,
): Promise<void> {
  const preferences =
    patientNotificationPreferencesSchema.parse(untrustedInput);
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Notification preferences are unavailable');
  }

  const { error } = await supabase
    .from('patient_notification_preferences')
    .update({
      appointment_reminders_enabled: preferences.appointmentRemindersEnabled,
    });
  if (error) throw new Error('Notification preferences are unavailable');
}

async function finishEvent(
  privileged: ReturnType<typeof createPrivilegedClient>,
  eventId: string,
  succeeded: boolean,
  providerMessageId: string | null,
  errorCode: string | null,
) {
  const { error } = await privileged.rpc('finish_notification_event', {
    p_error_code: errorCode,
    p_event_id: eventId,
    p_provider_message_id: providerMessageId,
    p_succeeded: succeeded,
  });
  if (error) throw new Error('Notifications are unavailable');
}
