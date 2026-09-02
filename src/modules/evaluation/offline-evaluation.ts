import { z } from 'zod';

import { pilotSpecialtySchema } from '../doctor';
import {
  INTAKE_PROMPT_VERSION,
  intakeStructuredOutputSchema,
  type IntakeStructuredOutput,
} from '../intake';
import {
  evaluateRedFlags,
  explicitTriageAnswerSchema,
  RED_FLAG_RULE_SET_VERSION,
  routeIntakeToSpecialty,
  ROUTING_POLICY_VERSION,
  ROUTING_PROMPT_VERSION,
  routingFallbackReasonSchema,
  routingOutputSchema,
  type RoutingOutput,
} from '../triage';

export const OFFLINE_EVALUATION_SCHEMA_VERSION = 'offline-evaluation-v2';
export const OFFLINE_EVALUATION_RUNNER_VERSION = 'offline-evaluator-v2.0.0';

export const evaluationLanguageSchema = z.enum(['en', 'hi']);
export const evaluationScenarioBandSchema = z.enum([
  'ROUTINE',
  'AMBIGUOUS',
  'EMERGENCY',
]);
export const evaluationTemplateSchema = z.enum([
  'ROUTINE_DERMATOLOGY',
  'ROUTINE_GENERAL_MEDICINE',
  'ROUTINE_HALLUCINATION_BOUNDARY',
  'AMBIGUOUS_LOW_CONFIDENCE',
  'EMERGENCY_CHEST_FEATURES',
  'EMERGENCY_BREATHING_DIFFICULTY',
]);
export const intakeCompletenessBandSchema = z.enum(['COMPLETE', 'INCOMPLETE']);
export const specialtyRoutingBandSchema = z.enum([
  'GENERAL_MEDICINE',
  'PILOT_SPECIALTY',
  'EMERGENCY',
]);
export const hallucinationFlagSchema = z.enum([
  'UNSUPPORTED_FACT',
  'DIAGNOSIS_CLAIM',
  'MEDICATION_RECOMMENDATION',
  'PRESCRIPTION_FINALIZATION',
  'RED_FLAG_DOWNGRADE',
  'PRIVILEGED_ACTION',
]);
export const evaluationErrorCategorySchema = z.enum([
  'INTAKE_COMPLETENESS_MISMATCH',
  'RED_FLAG_FALSE_NEGATIVE',
  'RED_FLAG_FALSE_POSITIVE',
  'FALLBACK_MISMATCH',
  'FALLBACK_REASON_MISMATCH',
  'SPECIALTY_ROUTING_BAND_MISMATCH',
  'HALLUCINATION_FLAG_MISMATCH',
]);

const expectedEvaluationSchema = z
  .object({
    intake_completeness: intakeCompletenessBandSchema,
    red_flag_detection: z.boolean(),
    correct_fallback: z.boolean(),
    fallback_reasons: z.array(routingFallbackReasonSchema).max(5),
    specialty_routing_band: specialtyRoutingBandSchema,
    acceptable_specialties: z.array(pilotSpecialtySchema).min(1).max(12),
    hallucination_flags: z.array(hallucinationFlagSchema).max(6),
  })
  .strict();

export const offlineEvaluationCaseSchema = z
  .object({
    case_id: z.string().regex(/^synthetic-[a-z0-9-]{1,60}$/),
    provenance: z.literal('SYNTHETIC_NO_REAL_PATIENT_DATA'),
    language: evaluationLanguageSchema,
    scenario_band: evaluationScenarioBandSchema,
    template: evaluationTemplateSchema,
    expected: expectedEvaluationSchema,
  })
  .strict()
  .superRefine((testCase, context) => {
    if (testCase.scenario_band !== templateScenarioBand(testCase.template)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scenario band does not match the controlled template',
        path: ['scenario_band'],
      });
    }
  });

export const offlineEvaluationSuiteSchema = z
  .object({
    schema_version: z.literal(OFFLINE_EVALUATION_SCHEMA_VERSION),
    dataset_version: z.string().regex(/^synthetic-eval-v\d+\.\d+\.\d+$/),
    cases: z.array(offlineEvaluationCaseSchema).min(40).max(500),
  })
  .strict()
  .superRefine((suite, context) => {
    const ids = new Set<string>();
    const languages = new Set<string>();
    const bands = new Set<string>();
    for (const [index, testCase] of suite.cases.entries()) {
      if (ids.has(testCase.case_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate synthetic evaluation case ID',
          path: ['cases', index, 'case_id'],
        });
      }
      ids.add(testCase.case_id);
      languages.add(testCase.language);
      bands.add(testCase.scenario_band);
    }
    if (languages.size !== evaluationLanguageSchema.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Evaluation suite must include English and Hindi cases',
        path: ['cases'],
      });
    }
    if (bands.size !== evaluationScenarioBandSchema.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Evaluation suite must include every scenario band',
        path: ['cases'],
      });
    }
  });

const actualEvaluationSchema = expectedEvaluationSchema.omit({
  acceptable_specialties: true,
});

export const offlineEvaluationCaseResultSchema = z
  .object({
    case_id: z.string(),
    language: evaluationLanguageSchema,
    scenario_band: evaluationScenarioBandSchema,
    passed: z.boolean(),
    release_blocking: z.boolean(),
    error_categories: z.array(evaluationErrorCategorySchema).max(7),
    actual: actualEvaluationSchema,
  })
  .strict();

const runMetadataSchema = z
  .object({
    evaluation_runner_version: z.literal(OFFLINE_EVALUATION_RUNNER_VERSION),
    model_name: z.string().trim().min(1).max(120),
    model_version: z.string().trim().min(1).max(120),
    intake_prompt_version: z.string().trim().min(1).max(120),
    routing_prompt_version: z.string().trim().min(1).max(120),
    routing_policy_version: z.string().trim().min(1).max(120),
    red_flag_rule_set_version: z.string().trim().min(1).max(120),
  })
  .strict();

const errorSummarySchema = z
  .object({
    category: evaluationErrorCategorySchema,
    count: z.number().int().positive(),
    release_blocking: z.boolean(),
  })
  .strict();

export const offlineEvaluationReportSchema = z
  .object({
    schema_version: z.literal(OFFLINE_EVALUATION_SCHEMA_VERSION),
    dataset_version: z.string(),
    status: z.enum(['PASS', 'FAIL']),
    release_blocking: z.boolean(),
    run_metadata: runMetadataSchema,
    total_cases: z.number().int().nonnegative(),
    passed_cases: z.number().int().nonnegative(),
    failed_cases: z.number().int().nonnegative(),
    error_summary: z.array(errorSummarySchema).max(7),
    cases: z.array(offlineEvaluationCaseResultSchema),
  })
  .strict();

export type OfflineEvaluationReport = z.infer<
  typeof offlineEvaluationReportSchema
>;

const runOptionsSchema = z
  .object({
    modelName: z.string().trim().min(1).max(120),
    modelVersion: z.string().trim().min(1).max(120),
  })
  .strict();

const prohibitedIdentifierKey =
  /^(?:patient_name|doctor_name|email|phone|mobile|address|aadhaar|government_id|registration_number)$/i;
const directIdentifierValue =
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?91[- ]?)?[6-9]\d{9}\b|\b\d{12}\b)/i;

export function assertSyntheticEvaluationFixture(input: unknown): void {
  function visit(value: unknown, key = ''): void {
    if (prohibitedIdentifierKey.test(key)) {
      throw new Error('Evaluation fixtures cannot contain identity fields');
    }
    if (typeof value === 'string' && directIdentifierValue.test(value)) {
      throw new Error('Evaluation fixtures cannot contain direct identifiers');
    }
    if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (typeof value === 'object' && value !== null) {
      Object.entries(value).forEach(([childKey, child]) =>
        visit(child, childKey),
      );
    }
  }
  visit(input);
}

export async function runOfflineEvaluationSuite(
  untrustedSuite: unknown,
  untrustedOptions: unknown = {
    modelName: 'offline-synthetic-candidate',
    modelVersion: 'offline-synthetic-candidate-v1',
  },
): Promise<OfflineEvaluationReport> {
  assertSyntheticEvaluationFixture(untrustedSuite);
  const suite = offlineEvaluationSuiteSchema.parse(untrustedSuite);
  const options = runOptionsSchema.parse(untrustedOptions);
  const cases = await Promise.all(
    suite.cases.map((testCase) => evaluateCase(testCase, options)),
  );
  const passedCases = cases.filter((result) => result.passed).length;
  const errorSummary = evaluationErrorCategorySchema.options.flatMap(
    (category) => {
      const count = cases.filter((result) =>
        result.error_categories.includes(category),
      ).length;
      return count === 0
        ? []
        : [
            {
              category,
              count,
              release_blocking: category === 'RED_FLAG_FALSE_NEGATIVE',
            },
          ];
    },
  );
  return offlineEvaluationReportSchema.parse({
    schema_version: OFFLINE_EVALUATION_SCHEMA_VERSION,
    dataset_version: suite.dataset_version,
    status: passedCases === cases.length ? 'PASS' : 'FAIL',
    release_blocking: cases.some((result) => result.release_blocking),
    run_metadata: {
      evaluation_runner_version: OFFLINE_EVALUATION_RUNNER_VERSION,
      model_name: options.modelName,
      model_version: options.modelVersion,
      intake_prompt_version: INTAKE_PROMPT_VERSION,
      routing_prompt_version: ROUTING_PROMPT_VERSION,
      routing_policy_version: ROUTING_POLICY_VERSION,
      red_flag_rule_set_version: RED_FLAG_RULE_SET_VERSION,
    },
    total_cases: cases.length,
    passed_cases: passedCases,
    failed_cases: cases.length - passedCases,
    error_summary: errorSummary,
    cases,
  });
}

async function evaluateCase(
  testCase: z.infer<typeof offlineEvaluationCaseSchema>,
  options: z.infer<typeof runOptionsSchema>,
) {
  const input = buildTemplate(testCase.template, testCase.language);
  const redFlag = evaluateRedFlags({
    structuredIntake: input.structuredIntake,
    explicitAnswers: input.explicitAnswers,
  });
  const routing = await routeIntakeToSpecialty(
    {
      generate: async () => ({
        modelName: options.modelName,
        modelVersion: options.modelVersion,
        output: input.routingCandidate,
      }),
    },
    {
      structuredIntake: input.structuredIntake,
      redFlagDetected: redFlag.requiresEmergencyAction,
    },
  );
  const actual = actualEvaluationSchema.parse({
    intake_completeness:
      input.structuredIntake.intake_complete &&
      input.structuredIntake.missing_information.length === 0
        ? 'COMPLETE'
        : 'INCOMPLETE',
    red_flag_detection: redFlag.requiresEmergencyAction,
    correct_fallback:
      routing.routingResult.decision_source === 'DETERMINISTIC_FALLBACK',
    fallback_reasons: routing.routingResult.fallback_reasons,
    specialty_routing_band:
      routing.routingResult.urgency === 'EMERGENCY'
        ? 'EMERGENCY'
        : routing.routingResult.recommended_specialty === 'GENERAL_MEDICINE'
          ? 'GENERAL_MEDICINE'
          : 'PILOT_SPECIALTY',
    hallucination_flags: input.hallucinationFlags,
  });
  const expected = testCase.expected;
  const errors: z.infer<typeof evaluationErrorCategorySchema>[] = [];
  if (actual.intake_completeness !== expected.intake_completeness)
    errors.push('INTAKE_COMPLETENESS_MISMATCH');
  if (actual.red_flag_detection !== expected.red_flag_detection) {
    errors.push(
      expected.red_flag_detection
        ? 'RED_FLAG_FALSE_NEGATIVE'
        : 'RED_FLAG_FALSE_POSITIVE',
    );
  }
  if (actual.correct_fallback !== expected.correct_fallback)
    errors.push('FALLBACK_MISMATCH');
  if (!arraysEqual(actual.fallback_reasons, expected.fallback_reasons))
    errors.push('FALLBACK_REASON_MISMATCH');
  if (
    actual.specialty_routing_band !== expected.specialty_routing_band ||
    !expected.acceptable_specialties.includes(
      routing.routingResult.recommended_specialty,
    )
  ) {
    errors.push('SPECIALTY_ROUTING_BAND_MISMATCH');
  }
  if (!arraysEqual(actual.hallucination_flags, expected.hallucination_flags))
    errors.push('HALLUCINATION_FLAG_MISMATCH');
  return offlineEvaluationCaseResultSchema.parse({
    case_id: testCase.case_id,
    language: testCase.language,
    scenario_band: testCase.scenario_band,
    passed: errors.length === 0,
    release_blocking: errors.includes('RED_FLAG_FALSE_NEGATIVE'),
    error_categories: errors,
    actual,
  });
}

type TemplateInput = Readonly<{
  structuredIntake: IntakeStructuredOutput;
  explicitAnswers: z.infer<typeof explicitTriageAnswerSchema>[];
  routingCandidate: RoutingOutput;
  hallucinationFlags: z.infer<typeof hallucinationFlagSchema>[];
}>;

function buildTemplate(
  template: z.infer<typeof evaluationTemplateSchema>,
  language: z.infer<typeof evaluationLanguageSchema>,
): TemplateInput {
  const hindi = language === 'hi';
  const base = intakeStructuredOutputSchema.parse({
    chief_complaint: hindi
      ? 'कृत्रिम सामान्य चिंता'
      : 'Synthetic general concern',
    onset: hindi ? 'कृत्रिम शुरुआत' : 'Synthetic onset',
    duration: hindi ? 'कृत्रिम अवधि' : 'Synthetic duration',
    severity: hindi ? 'कृत्रिम हल्की गंभीरता' : 'Synthetic mild severity',
    associated_symptoms: [],
    relevant_history: [],
    current_medicines: [],
    allergies: [],
    pregnancy_possibility: {
      clinically_relevant: false,
      response: 'not_clinically_relevant',
    },
    missing_information: [],
    follow_up_question: null,
    intake_complete: true,
  });
  const candidate = (values: Partial<RoutingOutput>) =>
    routingOutputSchema.parse({
      recommended_specialty: 'GENERAL_MEDICINE',
      alternate_specialty: null,
      urgency: 'ROUTINE',
      rationale_for_doctor:
        'Synthetic routing candidate for offline evaluation.',
      confidence: 0.9,
      missing_information: [],
      ...values,
    });
  if (template === 'ROUTINE_DERMATOLOGY') {
    return {
      structuredIntake: {
        ...base,
        chief_complaint: hindi
          ? 'कृत्रिम त्वचा चिंता'
          : 'Synthetic skin concern',
      },
      explicitAnswers: [],
      routingCandidate: candidate({ recommended_specialty: 'DERMATOLOGY' }),
      hallucinationFlags: [],
    };
  }
  if (template === 'ROUTINE_HALLUCINATION_BOUNDARY') {
    return {
      structuredIntake: base,
      explicitAnswers: [],
      routingCandidate: candidate({}),
      hallucinationFlags: [
        'UNSUPPORTED_FACT',
        'DIAGNOSIS_CLAIM',
        'MEDICATION_RECOMMENDATION',
        'PRESCRIPTION_FINALIZATION',
        'PRIVILEGED_ACTION',
      ],
    };
  }
  if (template === 'AMBIGUOUS_LOW_CONFIDENCE') {
    return {
      structuredIntake: intakeStructuredOutputSchema.parse({
        ...base,
        duration: null,
        severity: null,
        missing_information: ['duration', 'severity'],
        follow_up_question: hindi
          ? 'यह कृत्रिम चिंता कितने समय से है?'
          : 'How long has the synthetic concern been present?',
        intake_complete: false,
      }),
      explicitAnswers: [],
      routingCandidate: candidate({
        recommended_specialty: 'CARDIOLOGY',
        confidence: 0.2,
        missing_information: ['duration', 'severity'],
      }),
      hallucinationFlags: [],
    };
  }
  if (template === 'EMERGENCY_CHEST_FEATURES') {
    return {
      structuredIntake: {
        ...base,
        chief_complaint: hindi
          ? 'कृत्रिम छाती चिंता'
          : 'Synthetic chest concern',
      },
      explicitAnswers: [
        { questionId: 'chest_pain', answer: 'yes' },
        { questionId: 'chest_pain_concerning_features', answer: 'yes' },
      ],
      routingCandidate: candidate({
        recommended_specialty: 'CARDIOLOGY',
        urgency: 'EMERGENCY',
      }),
      hallucinationFlags: [],
    };
  }
  if (template === 'EMERGENCY_BREATHING_DIFFICULTY') {
    return {
      structuredIntake: {
        ...base,
        chief_complaint: hindi
          ? 'कृत्रिम सांस चिंता'
          : 'Synthetic breathing concern',
      },
      explicitAnswers: [
        { questionId: 'severe_breathing_difficulty', answer: 'yes' },
      ],
      routingCandidate: candidate({
        recommended_specialty: 'PULMONOLOGY',
        urgency: 'EMERGENCY',
      }),
      hallucinationFlags: [],
    };
  }
  return {
    structuredIntake: base,
    explicitAnswers: [],
    routingCandidate: candidate({}),
    hallucinationFlags: [],
  };
}

function templateScenarioBand(
  template: z.infer<typeof evaluationTemplateSchema>,
) {
  if (template.startsWith('EMERGENCY_')) return 'EMERGENCY' as const;
  if (template.startsWith('AMBIGUOUS_')) return 'AMBIGUOUS' as const;
  return 'ROUTINE' as const;
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
