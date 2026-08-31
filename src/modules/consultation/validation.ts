import { z } from 'zod';

export const appointmentDetailIdSchema = z.string().uuid();

export function parseAppointmentDetailId(input: unknown): string {
  return appointmentDetailIdSchema.parse(input);
}
