import { describe, expect, it } from 'vitest';

import { followUpRecommendationInputSchema } from './follow-up';

describe('follow-up recommendation validation', () => {
  it('accepts a controlled timing recommendation', () => {
    expect(
      followUpRecommendationInputSchema.parse({
        appointmentId: '81000000-0000-4000-8000-000000000001',
        timing: 'WITHIN_14_DAYS',
      }),
    ).toEqual({
      appointmentId: '81000000-0000-4000-8000-000000000001',
      timing: 'WITHIN_14_DAYS',
    });
  });

  it('rejects free-text clinical context and unsupported timing', () => {
    expect(() =>
      followUpRecommendationInputSchema.parse({
        appointmentId: '81000000-0000-4000-8000-000000000001',
        timing: 'when symptoms return',
        priorPrescription: 'do not copy',
      }),
    ).toThrow();
  });
});
