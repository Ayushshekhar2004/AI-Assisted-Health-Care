import { z } from 'zod';

const optionalText = (maximumLength: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(maximumLength).optional(),
  );

const optionalFeeInPaise = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^\d{1,6}(?:\.\d{1,2})?$/)
    .transform((value) => Math.round(Number(value) * 100))
    .optional(),
);

const doctorOnboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  qualification: z.string().trim().min(2).max(160),
  registrationNumber: z.string().trim().regex(/^[A-Za-z0-9./ -]{2,80}$/),
  registrationCouncil: z.string().trim().min(2).max(120),
  registrationState: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(120),
  languages: z.array(z.enum(['en', 'hi'])).min(1).max(2).refine((items) => {
    return new Set(items).size === items.length;
  }),
  teleconsultationFeePaise: optionalFeeInPaise,
  clinicCity: optionalText(120),
  clinicAddress: optionalText(500),
});

export type DoctorOnboardingInput = z.infer<typeof doctorOnboardingSchema>;

export function parseDoctorOnboarding(input: unknown): DoctorOnboardingInput {
  return doctorOnboardingSchema.parse(input);
}
