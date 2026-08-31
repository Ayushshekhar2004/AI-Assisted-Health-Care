import { describe, expect, it } from 'vitest';

import { doctorHandoffSummarySchema, generateDoctorHandoff } from './handoff';

const structuredIntake = {
  chief_complaint: 'Synthetic patient-provided concern.',
  onset: 'Synthetic onset.',
  duration: 'Two synthetic days.',
  severity: 'Moderate.',
  associated_symptoms: ['Synthetic associated information.'],
  relevant_history: ['Synthetic relevant history.'],
  current_medicines: ['Synthetic medicine entry.'],
  allergies: ['Synthetic allergy entry.'],
  pregnancy_possibility: {
    clinically_relevant: false,
    response: 'not_clinically_relevant' as const,
  },
  missing_information: ['duration'] as const,
  follow_up_question: 'How long has this been present?',
  intake_complete: false,
};

const answers = [
  ['severe_breathing_difficulty', 'no'],
  ['chest_pain', 'unknown'],
  ['chest_pain_concerning_features', 'no'],
  ['stroke_like_symptoms', 'no'],
  ['unconsciousness_or_confusion', 'no'],
  ['uncontrolled_bleeding', 'no'],
  ['severe_allergic_reaction', 'no'],
  ['suicidal_or_self_harm_emergency', 'no'],
  ['severe_trauma', 'no'],
].map(([questionId, answer]) => ({ questionId, answer }));

describe('doctor handoff generator', () => {
  it('uses structured fields and only explicit no answers for important negatives', () => {
    const handoff = generateDoctorHandoff({
      structuredIntake,
      explicitAnswers: answers,
      triage: {
        outcome: 'NO_RED_FLAG',
        matchedRuleCodes: [],
        ruleSetVersion: 'red-flags-v1.0.0',
      },
      routingReason: 'Synthetic non-diagnostic routing rationale.',
    });

    expect(handoff.chief_complaint).toBe(structuredIntake.chief_complaint);
    expect(handoff.timeline).toEqual({
      onset: structuredIntake.onset,
      duration: structuredIntake.duration,
    });
    expect(
      handoff.important_negatives.map((item) => item.question_id),
    ).toContain('severe_breathing_difficulty');
    expect(
      handoff.important_negatives.map((item) => item.question_id),
    ).not.toContain('chest_pain');
    expect(handoff.unanswered_questions).toContain('Duration');
    expect(handoff.unanswered_questions).toContain(
      'Are you having chest pain right now?',
    );
    expect(handoff.patient_quotes).toEqual([]);
    expect(handoff.source_trace).toContainEqual({
      item_key: 'chief_complaint',
      source_kind: 'STRUCTURED_INTAKE',
      source_field: 'chief_complaint',
      recorded_answer: null,
    });
    expect(handoff.source_trace).toContainEqual({
      item_key: expect.stringMatching(/^important_negatives\./),
      source_kind: 'EXPLICIT_SCREENING_ANSWER',
      source_field: 'emergency_screening.severe_breathing_difficulty',
      recorded_answer: 'no',
    });
  });

  it('preserves a deterministic red flag and rejects forbidden extra output fields', () => {
    const handoff = generateDoctorHandoff({
      structuredIntake,
      explicitAnswers: answers.map((answer) =>
        answer.questionId === 'severe_trauma'
          ? { ...answer, answer: 'yes' }
          : answer,
      ),
      triage: {
        outcome: 'RED_FLAG',
        matchedRuleCodes: ['SEVERE_TRAUMA'],
        ruleSetVersion: 'red-flags-v1.0.0',
      },
      routingReason: null,
    });

    expect(handoff.red_flag_status).toEqual({
      outcome: 'RED_FLAG',
      matched_rule_codes: ['SEVERE_TRAUMA'],
      rule_set_version: 'red-flags-v1.0.0',
    });
    expect(() =>
      doctorHandoffSummarySchema.parse({
        ...handoff,
        diagnosis: 'Forbidden synthetic field',
      }),
    ).toThrow();
  });
});
