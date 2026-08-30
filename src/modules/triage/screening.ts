import { z } from 'zod';

import { explicitTriageAnswerSchema } from './rules';

export const EMERGENCY_SCREENING_QUESTIONS = [
  {
    id: 'severe_breathing_difficulty',
    prompt: 'Are you having severe difficulty breathing right now?',
  },
  {
    id: 'chest_pain',
    prompt: 'Are you having chest pain right now?',
  },
  {
    id: 'chest_pain_concerning_features',
    prompt:
      'If you have chest pain, is it severe, new, worsening, or otherwise concerning to you?',
  },
  {
    id: 'stroke_like_symptoms',
    prompt:
      'Are you having sudden stroke-like symptoms, such as new face, arm, speech, vision, or balance difficulty?',
  },
  {
    id: 'unconsciousness_or_confusion',
    prompt:
      'Is the person unconscious, difficult to wake, or suddenly severely confused?',
  },
  {
    id: 'uncontrolled_bleeding',
    prompt: 'Is there severe bleeding that is not stopping?',
  },
  {
    id: 'severe_allergic_reaction',
    prompt:
      'Is there a severe allergic reaction with breathing difficulty, collapse, or rapidly worsening swelling?',
  },
  {
    id: 'suicidal_or_self_harm_emergency',
    prompt:
      'Are you or someone else in immediate danger from suicide or self-harm?',
  },
  {
    id: 'severe_trauma',
    prompt: 'Has there been a severe injury or trauma requiring urgent help?',
  },
] as const;

const requiredQuestionIds = new Set(
  EMERGENCY_SCREENING_QUESTIONS.map((question) => question.id),
);

export const emergencyScreeningAnswersSchema = z
  .array(explicitTriageAnswerSchema)
  .length(EMERGENCY_SCREENING_QUESTIONS.length)
  .superRefine((answers, context) => {
    const submittedIds = new Set(answers.map((answer) => answer.questionId));
    if (
      submittedIds.size !== requiredQuestionIds.size ||
      [...requiredQuestionIds].some((id) => !submittedIds.has(id))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Every emergency screening question requires an explicit answer',
      });
    }
  });

export type EmergencyScreeningAnswer = z.infer<
  typeof explicitTriageAnswerSchema
>;

export function parseEmergencyScreeningAnswers(
  input: unknown,
): EmergencyScreeningAnswer[] {
  return emergencyScreeningAnswersSchema.parse(input);
}
