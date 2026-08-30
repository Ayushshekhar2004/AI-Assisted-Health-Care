import { describe, expect, it } from 'vitest';

import {
  EMERGENCY_SCREENING_QUESTIONS,
  parseEmergencyScreeningAnswers,
} from './screening';

const completeAnswers = EMERGENCY_SCREENING_QUESTIONS.map((question) => ({
  questionId: question.id,
  answer: 'no' as const,
}));

describe('emergency screening validation', () => {
  it('requires one validated explicit answer for every configured question', () => {
    expect(parseEmergencyScreeningAnswers(completeAnswers)).toEqual(
      completeAnswers,
    );
    expect(() =>
      parseEmergencyScreeningAnswers(completeAnswers.slice(1)),
    ).toThrow();
    expect(() =>
      parseEmergencyScreeningAnswers([
        ...completeAnswers.slice(0, -1),
        { questionId: 'untrusted_question', answer: 'no' },
      ]),
    ).toThrow();
  });

  it('rejects inferred or ambiguous values outside yes, no, and unknown', () => {
    expect(() =>
      parseEmergencyScreeningAnswers([
        ...completeAnswers.slice(0, -1),
        {
          questionId: completeAnswers.at(-1)?.questionId,
          answer: 'probably',
        },
      ]),
    ).toThrow();
  });
});
