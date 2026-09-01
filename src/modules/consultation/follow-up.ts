import { z } from 'zod';

export const followUpTimingSchema = z.enum([
  'WITHIN_7_DAYS',
  'WITHIN_14_DAYS',
  'WITHIN_30_DAYS',
  'AS_NEEDED',
]);

export const followUpRecommendationInputSchema = z
  .object({
    appointmentId: z.string().uuid(),
    timing: followUpTimingSchema,
  })
  .strict();

export const followUpRecommendationSchema = z
  .object({
    id: z.string().uuid(),
    sourceAppointmentId: z.string().uuid(),
    doctorName: z.string().trim().min(1).max(120),
    timing: followUpTimingSchema,
    createdAt: z.string().datetime({ offset: true }),
    bookedAppointmentId: z.string().uuid().nullable(),
  })
  .strict();

export type FollowUpRecommendation = z.infer<
  typeof followUpRecommendationSchema
>;
