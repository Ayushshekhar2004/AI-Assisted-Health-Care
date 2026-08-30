import { describe, expect, it } from 'vitest';

import { verificationDecisionSchema } from './verification-validation';

describe('verificationDecisionSchema', () => {
  it('accepts an approval with a review reason', () => {
    expect(
      verificationDecisionSchema.parse({
        doctorId: '50000000-0000-4000-8000-000000000003',
        decision: 'approved',
        reason: 'Credentials reviewed and matched.',
      }).decision,
    ).toBe('approved');
  });

  it('rejects missing reasons, unknown decisions, and malformed identifiers', () => {
    expect(() =>
      verificationDecisionSchema.parse({
        doctorId: 'not-a-uuid',
        decision: 'verified',
        reason: '',
      }),
    ).toThrow();
  });
});
