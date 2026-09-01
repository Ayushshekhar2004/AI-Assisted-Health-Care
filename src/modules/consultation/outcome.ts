import { z } from 'zod';
import { pilotSpecialtySchema } from '../doctor';

export const consultationOutcomeTypeSchema = z.enum([
  'TELECONSULT_COMPLETED',
  'FOLLOW_UP_REQUIRED',
  'REFER_SPECIALTY',
  'PHYSICAL_EXAM_REQUIRED',
]);

export const consultationOutcomeInputSchema = z
  .object({
    appointmentId: z.string().uuid(),
    outcome: consultationOutcomeTypeSchema,
    referralSpecialty: z.union([pilotSpecialtySchema, z.literal('')]),
    clinicLocation: z.string().trim().max(500),
    locationInstructions: z.string().trim().max(1000),
    appointmentNote: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === 'REFER_SPECIALTY' && !value.referralSpecialty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Referral specialty is required',
      });
    }
    if (
      value.outcome === 'PHYSICAL_EXAM_REQUIRED' &&
      (!value.clinicLocation ||
        !value.locationInstructions ||
        !value.appointmentNote)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Physical visit details are required',
      });
    }
  });

export const consultationOutcomeSchema = z
  .object({
    id: z.string().uuid(),
    appointmentId: z.string().uuid(),
    outcome: consultationOutcomeTypeSchema,
    referralSpecialty: pilotSpecialtySchema.nullable(),
    clinicLocation: z.string().nullable(),
    locationInstructions: z.string().nullable(),
    appointmentNote: z.string().nullable(),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ConsultationOutcomeInput = z.infer<
  typeof consultationOutcomeInputSchema
>;
export type ConsultationOutcome = z.infer<typeof consultationOutcomeSchema>;
