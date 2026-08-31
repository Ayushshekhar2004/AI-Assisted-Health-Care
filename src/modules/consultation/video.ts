import { z } from 'zod';

export const appointmentVideoTokenRequestSchema = z
  .object({ appointmentId: z.string().uuid() })
  .strict();

export const appointmentVideoTokenResponseSchema = z
  .object({
    serverUrl: z.string().url().startsWith('wss://'),
    token: z.string().min(20).max(10000),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const appointmentConsultationStartRequestSchema = z
  .object({ appointmentId: z.string().uuid() })
  .strict();

export const appointmentConsultationStartResponseSchema = z
  .object({ status: z.enum(['CONFIRMED', 'IN_PROGRESS']) })
  .strict();

export function getAppointmentRoomName(appointmentIdInput: unknown): string {
  const appointmentId = z.string().uuid().parse(appointmentIdInput);
  return `appointment-${appointmentId}`;
}

export function isTrustedVideoTokenRequest(
  origin: string | null,
  expectedOrigin: string,
  contentType: string | null,
): boolean {
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return false;
  }
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
