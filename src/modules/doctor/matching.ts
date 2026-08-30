import { z } from 'zod';

import { pilotSpecialtySchema, type PilotSpecialty } from './specialties';

export const DOCTOR_MATCH_SHORTLIST_LIMIT = 5;
export const DOCTOR_MATCH_SLOT_LIMIT = 3;
export const consultationModeSchema = z.enum(['TELECONSULTATION', 'IN_PERSON']);
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const doctorSelectionRequestSchema = z
  .object({
    consultationMode: consultationModeSchema,
    availableFrom: isoDateTimeSchema,
    availableUntil: isoDateTimeSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const from = new Date(request.availableFrom);
    const until = new Date(request.availableUntil);
    const maximumWindowMs = 90 * 24 * 60 * 60 * 1000;
    if (
      until.getTime() <= from.getTime() ||
      until.getTime() - from.getTime() > maximumWindowMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Availability window is invalid',
        path: ['availableUntil'],
      });
    }
  });

export const doctorMatchSlotSchema = z
  .object({
    id: z.string().uuid(),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
  })
  .strict();

export const doctorMatchSchema = z
  .object({
    doctorId: z.string().uuid(),
    doctorName: z.string().trim().min(1).max(120),
    qualification: z.string().trim().min(1).max(160),
    registrationNumber: z.string().trim().min(2).max(80),
    specialty: pilotSpecialtySchema,
    consultationLanguages: z
      .array(z.enum(['en', 'hi']))
      .min(1)
      .max(2),
    feePaise: z.number().int().min(0).max(100000000).nullable(),
    clinicCity: z.string().trim().min(1).max(120).nullable(),
    consultationMode: consultationModeSchema,
    routingDecisionSource: z.enum(['AI', 'DETERMINISTIC_FALLBACK']),
    nextSlots: z
      .array(doctorMatchSlotSchema)
      .min(1)
      .max(DOCTOR_MATCH_SLOT_LIMIT),
  })
  .strict();

export const doctorMatchShortlistSchema = z
  .array(doctorMatchSchema)
  .max(DOCTOR_MATCH_SHORTLIST_LIMIT);

export type ConsultationMode = z.infer<typeof consultationModeSchema>;
export type DoctorSelectionRequest = z.infer<
  typeof doctorSelectionRequestSchema
>;
export type DoctorMatch = z.infer<typeof doctorMatchSchema>;

export function parseDoctorSelectionRequest(
  input: unknown,
): DoctorSelectionRequest {
  return doctorSelectionRequestSchema.parse(input);
}

export function explainDoctorSuggestion(match: DoctorMatch): string {
  const specialtyBasis =
    match.routingDecisionSource === 'DETERMINISTIC_FALLBACK'
      ? 'the conservative General Medicine routing fallback'
      : 'the suggested care specialty';
  const cityBasis =
    match.consultationMode === 'IN_PERSON'
      ? ', their clinic city matches your city'
      : '';

  return `Suggested because their verified specialty matches ${specialtyBasis}, they support your consultation language${cityBasis}, and they have an available slot.`;
}

export function formatSpecialtyLabel(specialty: PilotSpecialty): string {
  return specialty
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
