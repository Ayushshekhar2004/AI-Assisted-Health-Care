import { z } from 'zod';

import { intakeFieldSchema, intakeStructuredOutputSchema } from '../intake';

const identifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/);

const ruleCodeSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const explicitAnswerValueSchema = z.enum(['yes', 'no', 'unknown']);

export const explicitTriageAnswerSchema = z
  .object({
    questionId: identifierSchema,
    answer: explicitAnswerValueSchema,
  })
  .strict();

const structuredSignalSchema = z
  .object({
    field: intakeFieldSchema,
    /** Exact, normalized affirmative values approved by clinical governance. */
    values: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  })
  .strict();

const ruleSignalSchema = z
  .object({
    affirmativeAnswerIds: z.array(identifierSchema).max(20).default([]),
    structuredSignals: z.array(structuredSignalSchema).max(20).default([]),
  })
  .strict()
  .refine(
    (signal) =>
      signal.affirmativeAnswerIds.length > 0 ||
      signal.structuredSignals.length > 0,
    'A signal must have an explicit answer or structured-field value',
  );

export const redFlagRuleSchema = z
  .object({
    code: ruleCodeSchema,
    /** Every group must match; each group matches when any configured signal is affirmative. */
    allOf: z.array(ruleSignalSchema).min(1).max(10),
  })
  .strict();

export const redFlagRuleSetSchema = z
  .object({
    version: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    rules: z.array(redFlagRuleSchema).min(1).max(100),
  })
  .strict()
  .superRefine((ruleSet, context) => {
    const codes = new Set<string>();
    for (const [index, rule] of ruleSet.rules.entries()) {
      if (codes.has(rule.code)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate rule code: ${rule.code}`,
          path: ['rules', index, 'code'],
        });
      }
      codes.add(rule.code);
    }
  });

export const triageEvaluationInputSchema = z
  .object({
    structuredIntake: intakeStructuredOutputSchema,
    explicitAnswers: z.array(explicitTriageAnswerSchema).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const questionIds = new Set<string>();
    for (const [index, answer] of input.explicitAnswers.entries()) {
      if (questionIds.has(answer.questionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate explicit answer: ${answer.questionId}`,
          path: ['explicitAnswers', index, 'questionId'],
        });
      }
      questionIds.add(answer.questionId);
    }
  });

export type RedFlagRuleSet = z.infer<typeof redFlagRuleSetSchema>;
export type TriageEvaluationInput = z.infer<typeof triageEvaluationInputSchema>;

export const RED_FLAG_RULE_SET_VERSION = 'red-flags-v1.0.0';

/**
 * Initial conservative rule set. The question IDs are stable integration contracts; the UI must
 * collect a direct answer and must not infer one from generative-model confidence.
 */
export const INITIAL_RED_FLAG_RULE_SET = redFlagRuleSetSchema.parse({
  version: RED_FLAG_RULE_SET_VERSION,
  rules: [
    {
      code: 'SEVERE_BREATHING_DIFFICULTY',
      allOf: [{ affirmativeAnswerIds: ['severe_breathing_difficulty'] }],
    },
    {
      code: 'CHEST_PAIN_WITH_CONCERNING_FEATURES',
      allOf: [
        { affirmativeAnswerIds: ['chest_pain'] },
        { affirmativeAnswerIds: ['chest_pain_concerning_features'] },
      ],
    },
    {
      code: 'STROKE_LIKE_SYMPTOMS',
      allOf: [{ affirmativeAnswerIds: ['stroke_like_symptoms'] }],
    },
    {
      code: 'UNCONSCIOUSNESS_OR_CONFUSION',
      allOf: [{ affirmativeAnswerIds: ['unconsciousness_or_confusion'] }],
    },
    {
      code: 'UNCONTROLLED_BLEEDING',
      allOf: [{ affirmativeAnswerIds: ['uncontrolled_bleeding'] }],
    },
    {
      code: 'SEVERE_ALLERGIC_REACTION',
      allOf: [{ affirmativeAnswerIds: ['severe_allergic_reaction'] }],
    },
    {
      code: 'SUICIDAL_OR_SELF_HARM_EMERGENCY_LANGUAGE',
      allOf: [{ affirmativeAnswerIds: ['suicidal_or_self_harm_emergency'] }],
    },
    {
      code: 'SEVERE_TRAUMA',
      allOf: [{ affirmativeAnswerIds: ['severe_trauma'] }],
    },
  ],
});

export function createRedFlagRuleSet(configuration: unknown): RedFlagRuleSet {
  return redFlagRuleSetSchema.parse(configuration);
}
