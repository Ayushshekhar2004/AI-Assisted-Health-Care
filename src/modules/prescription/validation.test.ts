import { describe, expect, it } from 'vitest';
import { prescriptionInputSchema } from './validation';

const valid = {
  appointmentId: '81000000-0000-4000-8000-000000000001',
  followUp: 'Synthetic clinician follow-up.',
  items: [
    {
      itemType: 'MEDICINE' as const,
      itemName: 'Synthetic medicine',
      dosage: 'Synthetic dose',
      frequency: '',
      duration: '',
      instructions: '',
    },
  ],
};

describe('prescription validation', () => {
  it('accepts controlled medicine, test, and instruction items', () => {
    expect(prescriptionInputSchema.parse(valid)).toEqual(valid);
    expect(
      prescriptionInputSchema.parse({
        ...valid,
        items: [
          { ...valid.items[0], itemType: 'TEST' },
          { ...valid.items[0], itemType: 'INSTRUCTION' },
        ],
      }).items,
    ).toHaveLength(2);
  });

  it('rejects browser-selected ownership, status, and oversized lists', () => {
    expect(() =>
      prescriptionInputSchema.parse({
        ...valid,
        doctorId: crypto.randomUUID(),
      }),
    ).toThrow();
    expect(() =>
      prescriptionInputSchema.parse({ ...valid, status: 'FINAL' }),
    ).toThrow();
    expect(() =>
      prescriptionInputSchema.parse({
        ...valid,
        items: Array(51).fill(valid.items[0]),
      }),
    ).toThrow();
  });
});
