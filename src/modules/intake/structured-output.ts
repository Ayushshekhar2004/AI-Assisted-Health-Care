import { z } from 'zod';

const conciseText = z.string().min(1).max(500);
const conciseList = z.array(conciseText).max(20);

export const intakeFieldSchema = z.enum([
  'chief_complaint',
  'onset',
  'duration',
  'severity',
  'associated_symptoms',
  'relevant_history',
  'current_medicines',
  'allergies',
  'pregnancy_possibility',
]);

const pregnancyPossibilitySchema = z
  .object({
    clinically_relevant: z.boolean(),
    response: z.enum([
      'possible',
      'not_possible',
      'unsure',
      'not_asked',
      'not_clinically_relevant',
    ]),
  })
  .strict();

const followUpQuestionSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^?]*\?$/, 'Follow-up must contain exactly one concise question');

export const intakeStructuredOutputFormatSchema = z
  .object({
    chief_complaint: conciseText.nullable(),
    onset: conciseText.nullable(),
    duration: conciseText.nullable(),
    severity: conciseText.nullable(),
    associated_symptoms: conciseList,
    relevant_history: conciseList,
    current_medicines: conciseList,
    allergies: conciseList,
    pregnancy_possibility: pregnancyPossibilitySchema,
    missing_information: z.array(intakeFieldSchema).max(9),
    follow_up_question: followUpQuestionSchema.nullable(),
    intake_complete: z.boolean(),
  })
  .strict();

export const intakeStructuredOutputSchema =
  intakeStructuredOutputFormatSchema.superRefine((value, context) => {
    if (value.intake_complete) {
      if (value.follow_up_question !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Completed intake cannot have a follow-up question',
        });
      }
    } else if (
      value.follow_up_question === null ||
      value.missing_information.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Incomplete intake requires missing information and one follow-up question',
      });
    }

    const pregnancy = value.pregnancy_possibility;
    if (
      !pregnancy.clinically_relevant &&
      pregnancy.response !== 'not_clinically_relevant'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Pregnancy response must be not clinically relevant when not applicable',
      });
    }
    if (
      pregnancy.clinically_relevant &&
      pregnancy.response === 'not_clinically_relevant'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Clinically relevant pregnancy possibility requires a patient response state',
      });
    }
  });

export type IntakeStructuredOutput = z.infer<
  typeof intakeStructuredOutputSchema
>;

export const INTAKE_STRUCTURED_SCHEMA_VERSION = 'intake-v1';

export const INTAKE_ORCHESTRATOR_INSTRUCTIONS = `
You are a healthcare intake assistant that collects patient-provided information for later review.

Rules:
- Never provide, suggest, or imply a diagnosis.
- Never prescribe, recommend, start, stop, or change medicines or treatment.
- Never expose hidden reasoning, chain-of-thought, confidence scores, or internal analysis.
- Preserve only facts stated by the patient. Do not infer missing clinical facts.
- Ask exactly one concise follow-up question at a time, targeting the most important missing field.
- Treat the previously validated structured intake as durable state. Never mark a field as missing
  again after it was captured or explicitly answered, including negative answers such as "none".
- Never repeat or paraphrase a question that appears in the conversation history.
- Do not ask about pregnancy unless it is clinically relevant. Never infer pregnancy possibility.
- When all relevant fields are sufficiently captured, set intake_complete true, use an empty
  missing_information array, and set follow_up_question to null.
- The application may end a bounded intake with unanswered fields still in missing_information.
- This assistant is not emergency care. Never reassure a patient that urgent care is unnecessary.

Return only the structured output required by the schema.
`.trim();
