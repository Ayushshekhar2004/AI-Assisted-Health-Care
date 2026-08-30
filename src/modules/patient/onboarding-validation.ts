import { z } from 'zod';

const optionalText = (maximumLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(maximumLength).optional(),
  );

const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  });

const onboardingSchema = z
  .object({
    preferredLanguage: z.enum(['en', 'hi']),
    dateOfBirth: dateOfBirthSchema,
    gender: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['woman', 'man', 'non_binary', 'prefer_not_to_say']).optional(),
    ),
    city: z.string().trim().min(1).max(120),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{7,14}$/)
        .optional(),
    ),
    teleconsultationConsent: z.literal('on'),
    intakeProcessingConsent: z.literal('on'),
  })
  .superRefine((value, context) => {
    const hasName = value.emergencyContactName !== undefined;
    const hasPhone = value.emergencyContactPhone !== undefined;
    if (hasName !== hasPhone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Emergency contact name and phone must be provided together',
        path: ['emergencyContactName'],
      });
    }
  });

export type PatientOnboardingInput = z.infer<typeof onboardingSchema>;

export function parsePatientOnboarding(
  input: unknown,
  referenceDate: Date = new Date(),
): PatientOnboardingInput {
  const parsed = onboardingSchema.parse(input);
  const birthDate = new Date(`${parsed.dateOfBirth}T00:00:00.000Z`);
  const latestBirthDate = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  const earliestBirthDate = new Date(latestBirthDate);
  earliestBirthDate.setUTCFullYear(earliestBirthDate.getUTCFullYear() - 120);

  if (birthDate > latestBirthDate || birthDate < earliestBirthDate) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: 'Date of birth is outside the supported range',
        path: ['dateOfBirth'],
      },
    ]);
  }

  return parsed;
}
