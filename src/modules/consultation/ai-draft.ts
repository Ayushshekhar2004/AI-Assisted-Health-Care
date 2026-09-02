import { z } from 'zod';

import {
  safeAIGeneratedTextSchema,
  withAISecurityInstructions,
} from '../../lib/ai/prompt-security';
import { runAIWorkflow } from '../../lib/ai/failure';

import { intakeStructuredOutputSchema } from '../intake';

export const CONSULTATION_AI_PROMPT_VERSION = 'consultation-note-draft-v1';

export const consultationAIDraftRequestSchema = z
  .object({
    appointmentId: z.string().uuid(),
    doctorPoints: z.string().trim().min(1).max(4000),
    intakeReviewed: z.literal(true),
  })
  .strict();

export const consultationAIDraftOutputFormatSchema = z
  .object({
    subjective_history: z.string().max(8000),
    examination_observations: z.string().max(8000),
    assessment: z.string().max(8000),
    plan: z.string().max(8000),
    follow_up: z.string().max(4000),
  })
  .strict();

export const consultationAIDraftOutputSchema =
  consultationAIDraftOutputFormatSchema.superRefine((value, context) => {
    for (const [field, text] of Object.entries(value)) {
      if (!safeAIGeneratedTextSchema.safeParse(text).success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Draft contains a forbidden operational instruction',
          path: [field],
        });
      }
    }
  });

export const consultationAIDraftInputSchema = z
  .object({
    reviewedIntake: intakeStructuredOutputSchema.nullable(),
    doctorPoints: z.string().trim().min(1).max(4000),
  })
  .strict();

export type ConsultationAIDraftInput = z.infer<
  typeof consultationAIDraftInputSchema
>;
export interface ConsultationAIDraftModel {
  generate(input: ConsultationAIDraftInput): Promise<unknown>;
}

export const CONSULTATION_AI_DRAFT_INSTRUCTIONS = withAISecurityInstructions(
  `
You organize reviewed intake and doctor-entered points into an editable consultation-note draft.
- This is provisional AI content for an authorized doctor to review and edit.
- Never claim it is final, reviewed, signed, or ready to share with the patient.
- Do not invent findings, examination results, diagnoses, treatments, medicines, dosages, or follow-up.
- Do not issue a diagnosis or prescription. Organize only the doctor's stated assessment; otherwise
  state that clinician assessment is required.
- Organize only plan items explicitly entered by the doctor. Do not recommend medication.
- Retain remote-examination limitations and distinguish patient-reported facts from observations.
- Use only the supplied reviewed intake and doctor-entered points. Output no hidden reasoning.
`.trim(),
);

export async function generateConsultationAIDraft(
  model: ConsultationAIDraftModel,
  input: unknown,
) {
  const validated = consultationAIDraftInputSchema.parse(input);
  return runAIWorkflow('consultation_draft', async () =>
    z
      .object({
        modelName: z.string().trim().min(1).max(120),
        modelVersion: z.string().trim().min(1).max(120),
        output: consultationAIDraftOutputSchema,
      })
      .strict()
      .parse(await model.generate(validated)),
  );
}
