import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const availabilityIdSchema = z.string().uuid();
export const appointmentChangeReasonSchema = z.enum([
  'PATIENT_SCHEDULE_CONFLICT',
  'CARE_NO_LONGER_NEEDED',
  'DOCTOR_UNAVAILABLE',
  'CLINIC_OPERATIONAL',
  'OTHER',
]);

export const appointmentCancellationSchema = z
  .object({
    appointmentId: z.string().uuid(),
    reasonCategory: appointmentChangeReasonSchema,
  })
  .strict();

export const appointmentRescheduleSchema = appointmentCancellationSchema
  .extend({
    availabilityId: availabilityIdSchema,
  })
  .strict();

export const followUpBookingSchema = z
  .object({
    recommendationId: z.string().uuid(),
    availabilityId: availabilityIdSchema,
  })
  .strict();

const availabilityInputSchema = z.object({
  startsAtIso: isoDateTimeSchema,
  endsAtIso: isoDateTimeSchema,
});

export type AvailabilityInput = Readonly<{
  startsAtIso: string;
  endsAtIso: string;
}>;
export type AppointmentCancellationInput = z.infer<
  typeof appointmentCancellationSchema
>;
export type AppointmentRescheduleInput = z.infer<
  typeof appointmentRescheduleSchema
>;

export function parseAvailabilityInput(
  input: unknown,
  now: Date = new Date(),
): AvailabilityInput {
  const parsed = availabilityInputSchema.parse(input);
  const startsAt = new Date(parsed.startsAtIso);
  const endsAt = new Date(parsed.endsAtIso);
  const durationMs = endsAt.getTime() - startsAt.getTime();

  if (
    startsAt.getTime() <= now.getTime() ||
    durationMs <= 0 ||
    durationMs > 24 * 60 * 60 * 1000
  ) {
    throw new Error('Availability is invalid');
  }

  return parsed;
}

export function parseAvailabilityId(input: unknown): string {
  return availabilityIdSchema.parse(input);
}
