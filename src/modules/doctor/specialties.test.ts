import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PILOT_SPECIALTY,
  PILOT_SPECIALTY_CODES,
  PILOT_SPECIALTY_LABELS,
  pilotSpecialtySchema,
} from './specialties';

describe('pilot specialty taxonomy', () => {
  it('uses GENERAL_MEDICINE as a controlled fallback', () => {
    expect(DEFAULT_PILOT_SPECIALTY).toBe('GENERAL_MEDICINE');
    expect(PILOT_SPECIALTY_CODES).toContain(DEFAULT_PILOT_SPECIALTY);
  });

  it('has one display label for every valid code and rejects invented specialties', () => {
    expect(Object.keys(PILOT_SPECIALTY_LABELS)).toEqual([
      ...PILOT_SPECIALTY_CODES,
    ]);
    expect(() => pilotSpecialtySchema.parse('INVENTED_SPECIALTY')).toThrow();
  });
});
