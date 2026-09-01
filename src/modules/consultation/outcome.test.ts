import { describe, expect, it } from 'vitest';
import { consultationOutcomeInputSchema } from './outcome';
const base = {
  appointmentId: '81000000-0000-4000-8000-000000000001',
  referralSpecialty: '',
  clinicLocation: '',
  locationInstructions: '',
  appointmentNote: '',
} as const;
describe('consultation outcome validation', () => {
  it('requires controlled referral specialty', () => {
    expect(() =>
      consultationOutcomeInputSchema.parse({
        ...base,
        outcome: 'REFER_SPECIALTY',
      }),
    ).toThrow();
    expect(
      consultationOutcomeInputSchema.parse({
        ...base,
        outcome: 'REFER_SPECIALTY',
        referralSpecialty: 'CARDIOLOGY',
      }).outcome,
    ).toBe('REFER_SPECIALTY');
  });
  it('requires all physical-visit handoff fields and rejects ownership', () => {
    expect(() =>
      consultationOutcomeInputSchema.parse({
        ...base,
        outcome: 'PHYSICAL_EXAM_REQUIRED',
      }),
    ).toThrow();
    expect(() =>
      consultationOutcomeInputSchema.parse({
        ...base,
        outcome: 'TELECONSULT_COMPLETED',
        doctorId: crypto.randomUUID(),
      }),
    ).toThrow();
  });
});
