import { describe, expect, it } from 'vitest';

import {
  consultationNoteInputSchema,
  parseFinalConsultationNote,
} from './note';

const input = {
  appointmentId: '91000000-0000-4000-8000-000000000001',
  subjectiveHistory: 'Synthetic clinician-authored history.',
  examinationObservations: 'Remote examination limitations documented.',
  assessment: 'Synthetic clinician assessment.',
  plan: 'Synthetic clinician plan.',
  followUp: 'Synthetic follow-up.',
  telemedicineAdequacy: 'ADEQUATE' as const,
};

describe('consultation note validation', () => {
  it('allows an incomplete draft but rejects client identity fields', () => {
    expect(
      consultationNoteInputSchema.parse({
        ...input,
        assessment: '',
        telemedicineAdequacy: '',
      }),
    ).toBeTruthy();
    expect(() =>
      consultationNoteInputSchema.parse({
        ...input,
        doctorId: crypto.randomUUID(),
      }),
    ).toThrow();
  });

  it('requires substantive fields and an adequacy decision to finalize', () => {
    expect(parseFinalConsultationNote(input)).toEqual(input);
    expect(() =>
      parseFinalConsultationNote({ ...input, plan: '   ' }),
    ).toThrow();
    expect(() =>
      parseFinalConsultationNote({ ...input, telemedicineAdequacy: '' }),
    ).toThrow();
  });
});
