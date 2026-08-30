import { describe, expect, it } from 'vitest';

import {
  createRedFlagRuleSet,
  evaluateRedFlags,
  INITIAL_RED_FLAG_RULE_SET,
  RED_FLAG_RULE_SET_VERSION,
} from './index';

const structuredIntake = {
  chief_complaint: 'Synthetic routine concern',
  onset: 'Synthetic gradual onset',
  duration: 'Synthetic short duration',
  severity: 'Synthetic mild severity',
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
} as const;

function evaluate(explicitAnswers: { questionId: string; answer: string }[]) {
  return evaluateRedFlags({ structuredIntake, explicitAnswers });
}

describe('deterministic red-flag evaluation', () => {
  it('returns no red flag for negative, unknown, and missing answers', () => {
    expect(
      evaluate([
        { questionId: 'severe_breathing_difficulty', answer: 'no' },
        { questionId: 'stroke_like_symptoms', answer: 'unknown' },
      ]),
    ).toEqual({
      ruleSetVersion: RED_FLAG_RULE_SET_VERSION,
      outcome: 'NO_RED_FLAG',
      requiresEmergencyAction: false,
      matchedRuleCodes: [],
    });
  });

  it.each([
    ['severe_breathing_difficulty', 'SEVERE_BREATHING_DIFFICULTY'],
    ['stroke_like_symptoms', 'STROKE_LIKE_SYMPTOMS'],
    ['unconsciousness_or_confusion', 'UNCONSCIOUSNESS_OR_CONFUSION'],
    ['uncontrolled_bleeding', 'UNCONTROLLED_BLEEDING'],
    ['severe_allergic_reaction', 'SEVERE_ALLERGIC_REACTION'],
    [
      'suicidal_or_self_harm_emergency',
      'SUICIDAL_OR_SELF_HARM_EMERGENCY_LANGUAGE',
    ],
    ['severe_trauma', 'SEVERE_TRAUMA'],
  ])('escalates affirmative %s', (questionId, ruleCode) => {
    expect(evaluate([{ questionId, answer: 'yes' }])).toMatchObject({
      outcome: 'RED_FLAG',
      requiresEmergencyAction: true,
      matchedRuleCodes: [ruleCode],
    });
  });

  it('requires both chest-pain signal groups', () => {
    expect(
      evaluate([{ questionId: 'chest_pain', answer: 'yes' }]),
    ).toMatchObject({ outcome: 'NO_RED_FLAG' });
    expect(
      evaluate([
        { questionId: 'chest_pain', answer: 'yes' },
        { questionId: 'chest_pain_concerning_features', answer: 'yes' },
      ]),
    ).toMatchObject({
      outcome: 'RED_FLAG',
      matchedRuleCodes: ['CHEST_PAIN_WITH_CONCERNING_FEATURES'],
    });
  });

  it('supports clinician-approved configured rules using exact structured values', () => {
    const configuredRuleSet = createRedFlagRuleSet({
      version: 'clinician-approved-v2',
      rules: [
        {
          code: 'CLINICIAN_APPROVED_ADDITIONAL_RULE',
          allOf: [
            {
              structuredSignals: [
                {
                  field: 'associated_symptoms',
                  values: ['Synthetic approved marker'],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(
      evaluateRedFlags(
        {
          structuredIntake: {
            ...structuredIntake,
            associated_symptoms: ['  synthetic APPROVED marker '],
          },
          explicitAnswers: [],
        },
        configuredRuleSet,
      ),
    ).toMatchObject({
      ruleSetVersion: 'clinician-approved-v2',
      outcome: 'RED_FLAG',
      matchedRuleCodes: ['CLINICIAN_APPROVED_ADDITIONAL_RULE'],
    });
  });

  it('uses exact structured values and does not substring-match or infer negation', () => {
    const configuredRuleSet = createRedFlagRuleSet({
      version: 'clinician-approved-v2',
      rules: [
        {
          code: 'EXACT_VALUE_ONLY',
          allOf: [
            {
              structuredSignals: [
                { field: 'associated_symptoms', values: ['approved marker'] },
              ],
            },
          ],
        },
      ],
    });
    expect(
      evaluateRedFlags(
        {
          structuredIntake: {
            ...structuredIntake,
            associated_symptoms: ['No approved marker is present'],
          },
          explicitAnswers: [],
        },
        configuredRuleSet,
      ).outcome,
    ).toBe('NO_RED_FLAG');
  });

  it('rejects duplicate answers, duplicate rule codes, and unvalidated answer values', () => {
    expect(() =>
      evaluate([
        { questionId: 'severe_trauma', answer: 'yes' },
        { questionId: 'severe_trauma', answer: 'no' },
      ]),
    ).toThrow();
    expect(() =>
      evaluate([{ questionId: 'severe_trauma', answer: 'probably' }]),
    ).toThrow();
    expect(() =>
      createRedFlagRuleSet({
        version: 'duplicate-v1',
        rules: [
          INITIAL_RED_FLAG_RULE_SET.rules[0],
          INITIAL_RED_FLAG_RULE_SET.rules[0],
        ],
      }),
    ).toThrow();
  });
});
