import { z } from 'zod';

export const telemedicineAdequacySchema = z.enum([
  'ADEQUATE',
  'REQUIRES_IN_PERSON',
]);

const noteText = (max: number) => z.string().trim().max(max);

export const consultationNoteInputSchema = z
  .object({
    appointmentId: z.string().uuid(),
    subjectiveHistory: noteText(8000),
    examinationObservations: noteText(8000),
    assessment: noteText(8000),
    plan: noteText(8000),
    followUp: noteText(4000),
    telemedicineAdequacy: z.union([telemedicineAdequacySchema, z.literal('')]),
  })
  .strict();

export const consultationNoteSchema = z
  .object({
    id: z.string().uuid(),
    appointmentId: z.string().uuid(),
    subjectiveHistory: z.string().max(8000),
    examinationObservations: z.string().max(8000),
    assessment: z.string().max(8000),
    plan: z.string().max(8000),
    followUp: z.string().max(4000),
    telemedicineAdequacy: telemedicineAdequacySchema.nullable(),
    status: z.enum(['DRAFT', 'FINALIZED']),
    finalizedAt: z.string().datetime({ offset: true }).nullable(),
    finalizedByDoctorId: z.string().uuid().nullable(),
    aiDraftGeneratedAt: z.string().datetime({ offset: true }).nullable(),
    aiModelName: z.string().trim().min(1).max(120).nullable(),
    aiModelVersion: z.string().trim().min(1).max(120).nullable(),
    aiPromptVersion: z.string().trim().min(1).max(64).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ConsultationNoteInput = z.infer<typeof consultationNoteInputSchema>;
export type ConsultationNote = z.infer<typeof consultationNoteSchema>;

export function parseFinalConsultationNote(
  input: unknown,
): ConsultationNoteInput {
  const note = consultationNoteInputSchema.parse(input);
  if (
    !note.subjectiveHistory ||
    !note.examinationObservations ||
    !note.assessment ||
    !note.plan ||
    !note.telemedicineAdequacy
  ) {
    throw new Error('Final consultation note is incomplete');
  }
  return note;
}
