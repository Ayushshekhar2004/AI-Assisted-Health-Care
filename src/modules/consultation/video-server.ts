import 'server-only';

import { z } from 'zod';

import { createRoleAuthorizedClient } from '@/modules/auth';
import { dispatchNotificationEventsForAppointment } from '@/modules/notification/server';

import { getLiveKitConfig } from './livekit-config';
import {
  createScopedAppointmentToken,
  VIDEO_TOKEN_TTL_SECONDS,
} from './livekit-token';
import {
  appointmentConsultationStartRequestSchema,
  appointmentConsultationStartResponseSchema,
  appointmentVideoTokenRequestSchema,
  appointmentVideoTokenResponseSchema,
} from './video';

const authorizedRoleSchema = z.enum(['patient', 'doctor']);

export type AppointmentConsultationStart = z.infer<
  typeof appointmentConsultationStartResponseSchema
>;

export type AppointmentVideoToken = z.infer<
  typeof appointmentVideoTokenResponseSchema
>;

export async function createAppointmentVideoToken(
  untrustedInput: unknown,
): Promise<AppointmentVideoToken> {
  const input = appointmentVideoTokenRequestSchema.parse(untrustedInput);
  const { supabase, userId } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Video consultation is unavailable',
  );

  const { data, error } = await supabase.rpc(
    'authorize_appointment_video_token',
    { p_appointment_id: input.appointmentId },
  );
  if (error || !data?.length) {
    throw new Error('Video consultation is unavailable');
  }
  const participantRole = authorizedRoleSchema.parse(data[0].participant_role);
  const config = getLiveKitConfig();
  return appointmentVideoTokenResponseSchema.parse({
    serverUrl: config.serverUrl,
    token: await createScopedAppointmentToken({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      appointmentId: input.appointmentId,
      participantRole,
      userId,
    }),
    expiresAt: new Date(
      Date.now() + VIDEO_TOKEN_TTL_SECONDS * 1000,
    ).toISOString(),
  });
}

export async function startAppointmentConsultation(
  untrustedInput: unknown,
): Promise<AppointmentConsultationStart> {
  const input = appointmentConsultationStartRequestSchema.parse(untrustedInput);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient', 'doctor'],
    'Consultation is unavailable',
  );

  const { data, error } = await supabase.rpc('start_appointment_consultation', {
    p_appointment_id: input.appointmentId,
  });
  if (error) throw new Error('Consultation is unavailable');

  if (data === 'IN_PROGRESS') {
    await dispatchNotificationEventsForAppointment(input.appointmentId).catch(
      () => undefined,
    );
  }

  return appointmentConsultationStartResponseSchema.parse({ status: data });
}
