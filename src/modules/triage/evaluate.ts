import type { IntakeStructuredOutput } from '../intake';

import {
  INITIAL_RED_FLAG_RULE_SET,
  redFlagRuleSetSchema,
  triageEvaluationInputSchema,
  type RedFlagRuleSet,
  type TriageEvaluationInput,
} from './rules';

export type TriageEvaluationResult = Readonly<{
  ruleSetVersion: string;
  outcome: 'NO_RED_FLAG' | 'RED_FLAG';
  requiresEmergencyAction: boolean;
  matchedRuleCodes: readonly string[];
}>;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function getStructuredValues(
  intake: IntakeStructuredOutput,
  field: keyof Omit<
    IntakeStructuredOutput,
    'missing_information' | 'follow_up_question' | 'intake_complete'
  >,
): readonly string[] {
  const value = intake[field];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && 'response' in value) {
    return [value.response];
  }
  return [];
}

export function evaluateRedFlags(
  untrustedInput: unknown,
  untrustedRuleSet: unknown = INITIAL_RED_FLAG_RULE_SET,
): TriageEvaluationResult {
  const input: TriageEvaluationInput =
    triageEvaluationInputSchema.parse(untrustedInput);
  const ruleSet: RedFlagRuleSet = redFlagRuleSetSchema.parse(untrustedRuleSet);
  const affirmativeAnswers = new Set(
    input.explicitAnswers
      .filter((answer) => answer.answer === 'yes')
      .map((answer) => answer.questionId),
  );

  const matchedRuleCodes = ruleSet.rules
    .filter((rule) =>
      rule.allOf.every((group) => {
        const explicitMatch = group.affirmativeAnswerIds.some((questionId) =>
          affirmativeAnswers.has(questionId),
        );
        const structuredMatch = group.structuredSignals.some((signal) => {
          const configuredValues = new Set(signal.values.map(normalize));
          return getStructuredValues(input.structuredIntake, signal.field).some(
            (value) => configuredValues.has(normalize(value)),
          );
        });
        return explicitMatch || structuredMatch;
      }),
    )
    .map((rule) => rule.code);

  const requiresEmergencyAction = matchedRuleCodes.length > 0;
  return {
    ruleSetVersion: ruleSet.version,
    outcome: requiresEmergencyAction ? 'RED_FLAG' : 'NO_RED_FLAG',
    requiresEmergencyAction,
    matchedRuleCodes,
  };
}
