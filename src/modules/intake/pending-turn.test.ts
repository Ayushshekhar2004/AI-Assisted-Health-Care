import { describe, expect, it } from 'vitest';
import { hasPendingPatientTurn } from './pending-turn';

describe('hasPendingPatientTurn', () => {
  it('resumes only a patient turn that lacks an assistant response', () => {
    expect(hasPendingPatientTurn('patient')).toBe(true);
    expect(hasPendingPatientTurn('assistant')).toBe(false);
    expect(hasPendingPatientTurn(null)).toBe(false);
  });

  it('rejects untrusted role values', () => {
    expect(() => hasPendingPatientTurn('system')).toThrow();
  });
});
