import { z } from 'zod';

import { intakeStructuredOutputSchema } from '../intake/index';
import {
  emergencyScreeningAnswersSchema,
  EMERGENCY_SCREENING_QUESTIONS,
} from '../triage/index';

export const DOCTOR_HANDOFF_SUMMARY_VERSION = 'doctor-handoff-v2';
const handoffTextSchema = z.string().trim().min(1).max(800);

export const doctorHandoffSourceTraceSchema = z
  .object({
    item_key: z.string().regex(/^[a-z][a-z0-9_.]{0,119}$/),
    source_kind: z.enum([
      'STRUCTURED_INTAKE',
      'EXPLICIT_SCREENING_ANSWER',
      'DETERMINISTIC_TRIAGE',
      'SPECIALTY_ROUTING',
    ]),
    source_field: z.string().regex(/^[a-z][a-z0-9_.]{0,119}$/),
    recorded_answer: z.enum(['yes', 'no', 'unknown']).nullable(),
  })
  .strict();

const handoffSummaryFields = {
  chief_complaint: handoffTextSchema.nullable(),
  timeline: z
    .object({
      onset: handoffTextSchema.nullable(),
      duration: handoffTextSchema.nullable(),
    })
    .strict(),
  positives: z.array(handoffTextSchema).max(30),
  important_negatives: z
    .array(
      z
        .object({
          question_id: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
          statement: handoffTextSchema,
        })
        .strict(),
    )
    .max(30),
  relevant_history: z.array(handoffTextSchema).max(20),
  medications: z.array(handoffTextSchema).max(20),
  allergies: z.array(handoffTextSchema).max(20),
  red_flag_status: z
    .object({
      outcome: z.enum(['NOT_CHECKED', 'NO_RED_FLAG', 'RED_FLAG']),
      matched_rule_codes: z
        .array(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/))
        .max(100),
      rule_set_version: z.string().trim().min(1).max(64).nullable(),
    })
    .strict(),
  routing_reason: handoffTextSchema.nullable(),
  unanswered_questions: z.array(handoffTextSchema).max(30),
  patient_quotes: z.array(z.string().trim().min(1).max(500)).max(3),
};

export const legacyDoctorHandoffSummarySchema = z
  .object(handoffSummaryFields)
  .strict();
export const doctorHandoffSummarySchema = z
  .object({
    ...handoffSummaryFields,
    source_trace: z.array(doctorHandoffSourceTraceSchema).min(1).max(200),
  })
  .strict();

const handoffGeneratorInputSchema = z
  .object({
    structuredIntake: intakeStructuredOutputSchema,
    explicitAnswers: emergencyScreeningAnswersSchema,
    triage: z
      .object({
        outcome: z.enum(['NO_RED_FLAG', 'RED_FLAG']),
        matchedRuleCodes: z
          .array(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/))
          .max(100),
        ruleSetVersion: z.string().trim().min(1).max(64),
      })
      .strict()
      .nullable(),
    routingReason: handoffTextSchema.nullable(),
  })
  .strict();

export type DoctorHandoffSummary = z.infer<typeof doctorHandoffSummarySchema>;
export type DoctorHandoffSourceTrace = z.infer<
  typeof doctorHandoffSourceTraceSchema
>;

const questionById = new Map<
  string,
  (typeof EMERGENCY_SCREENING_QUESTIONS)[number]
>(EMERGENCY_SCREENING_QUESTIONS.map((question) => [question.id, question]));

const intakeFieldLabels = {
  chief_complaint: 'Chief complaint',
  onset: 'Onset',
  duration: 'Duration',
  severity: 'Severity',
  associated_symptoms: 'Associated symptoms',
  relevant_history: 'Relevant history',
  current_medicines: 'Current medicines',
  allergies: 'Allergies',
  pregnancy_possibility: 'Pregnancy possibility',
} as const;

export function generateDoctorHandoff(input: unknown): DoctorHandoffSummary {
  const source = handoffGeneratorInputSchema.parse(input);
  const negativeAnswers = source.explicitAnswers.filter(
    (answer) => answer.answer === 'no',
  );
  const unknownAnswers = source.explicitAnswers.filter(
    (answer) => answer.answer === 'unknown',
  );
  const importantNegatives = negativeAnswers.map((answer) => ({
    question_id: answer.questionId,
    statement: `Patient answered no: ${questionById.get(answer.questionId)?.prompt ?? answer.questionId}`,
  }));
  const unansweredSafetyQuestions = unknownAnswers.map(
    (answer) =>
      questionById.get(answer.questionId)?.prompt ?? answer.questionId,
  );
  const positives = [...source.structuredIntake.associated_symptoms];
  if (source.structuredIntake.severity) {
    positives.unshift(`Severity: ${source.structuredIntake.severity}`);
  }

  const sourceTrace: DoctorHandoffSourceTrace[] = [
    structuredTrace('chief_complaint', 'chief_complaint'),
    structuredTrace('timeline.onset', 'onset'),
    structuredTrace('timeline.duration', 'duration'),
    ...positives.map((_, index) =>
      structuredTrace(
        `positives.${index}`,
        source.structuredIntake.severity && index === 0
          ? 'severity'
          : `associated_symptoms.${source.structuredIntake.severity ? index - 1 : index}`,
      ),
    ),
    ...negativeAnswers.map((answer, index) => ({
      item_key: `important_negatives.${index}`,
      source_kind: 'EXPLICIT_SCREENING_ANSWER' as const,
      source_field: `emergency_screening.${answer.questionId}`,
      recorded_answer: answer.answer,
    })),
    ...source.structuredIntake.relevant_history.map((_, index) =>
      structuredTrace(`relevant_history.${index}`, `relevant_history.${index}`),
    ),
    ...source.structuredIntake.current_medicines.map((_, index) =>
      structuredTrace(`medications.${index}`, `current_medicines.${index}`),
    ),
    ...source.structuredIntake.allergies.map((_, index) =>
      structuredTrace(`allergies.${index}`, `allergies.${index}`),
    ),
    {
      item_key: 'red_flag_status',
      source_kind: 'DETERMINISTIC_TRIAGE',
      source_field: 'triage_results.outcome',
      recorded_answer: null,
    },
    ...(source.routingReason
      ? [
          {
            item_key: 'routing_reason',
            source_kind: 'SPECIALTY_ROUTING' as const,
            source_field: 'routing_result.rationale_for_doctor',
            recorded_answer: null,
          },
        ]
      : []),
    ...source.structuredIntake.missing_information.map((field, index) =>
      structuredTrace(
        `unanswered_questions.${index}`,
        `missing_information.${field}`,
      ),
    ),
    ...unknownAnswers.map((answer, index) => ({
      item_key: `unanswered_questions.${source.structuredIntake.missing_information.length + index}`,
      source_kind: 'EXPLICIT_SCREENING_ANSWER' as const,
      source_field: `emergency_screening.${answer.questionId}`,
      recorded_answer: answer.answer,
    })),
  ];

  return doctorHandoffSummarySchema.parse({
    chief_complaint: source.structuredIntake.chief_complaint,
    timeline: {
      onset: source.structuredIntake.onset,
      duration: source.structuredIntake.duration,
    },
    positives,
    important_negatives: importantNegatives,
    relevant_history: source.structuredIntake.relevant_history,
    medications: source.structuredIntake.current_medicines,
    allergies: source.structuredIntake.allergies,
    red_flag_status: source.triage
      ? {
          outcome: source.triage.outcome,
          matched_rule_codes: source.triage.matchedRuleCodes,
          rule_set_version: source.triage.ruleSetVersion,
        }
      : {
          outcome: 'NOT_CHECKED',
          matched_rule_codes: [],
          rule_set_version: null,
        },
    routing_reason: source.routingReason,
    unanswered_questions: [
      ...source.structuredIntake.missing_information.map(
        (field) => intakeFieldLabels[field],
      ),
      ...unansweredSafetyQuestions,
    ],
    // No verified verbatim provenance exists, so quotes remain intentionally omitted.
    patient_quotes: [],
    source_trace: sourceTrace,
  });
}

function structuredTrace(
  itemKey: string,
  sourceField: string,
): DoctorHandoffSourceTrace {
  return {
    item_key: itemKey,
    source_kind: 'STRUCTURED_INTAKE',
    source_field: sourceField,
    recorded_answer: null,
  };
}
