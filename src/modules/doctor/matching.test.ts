import { describe, expect, it } from 'vitest';

import {
  DOCTOR_MATCH_SHORTLIST_LIMIT,
  doctorMatchShortlistSchema,
  explainDoctorSuggestion,
  parseDoctorSelectionRequest,
  type DoctorMatch,
} from './matching';

const validRequest = {
  consultationMode: 'TELECONSULTATION',
  availableFrom: '2026-09-01T10:00:00.000Z',
  availableUntil: '2026-09-08T10:00:00.000Z',
};

const match: DoctorMatch = {
  doctorId: '51000000-0000-4000-8000-000000000001',
  doctorName: 'Dr Synthetic Match',
  qualification: 'Synthetic Medical Degree',
  registrationNumber: 'SYN-MATCH-1',
  specialty: 'GENERAL_MEDICINE',
  consultationLanguages: ['en'],
  feePaise: 50000,
  clinicCity: null,
  consultationMode: 'TELECONSULTATION',
  routingDecisionSource: 'AI',
  nextSlots: [
    {
      id: '61000000-0000-4000-8000-000000000001',
      startsAt: '2026-09-02T10:00:00.000Z',
      endsAt: '2026-09-02T10:30:00.000Z',
    },
  ],
};

describe('doctor selection validation', () => {
  it('accepts only controlled non-sensitive selection criteria', () => {
    expect(parseDoctorSelectionRequest(validRequest)).toEqual(validRequest);
    expect(() =>
      parseDoctorSelectionRequest({ ...validRequest, patientGender: 'woman' }),
    ).toThrow();
  });

  it('rejects reversed or excessively broad availability windows', () => {
    expect(() =>
      parseDoctorSelectionRequest({
        ...validRequest,
        availableUntil: validRequest.availableFrom,
      }),
    ).toThrow();
    expect(() =>
      parseDoctorSelectionRequest({
        ...validRequest,
        availableUntil: '2027-01-01T10:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects a response larger than the bounded shortlist', () => {
    expect(() =>
      doctorMatchShortlistSchema.parse(
        Array.from({ length: DOCTOR_MATCH_SHORTLIST_LIMIT + 1 }, () => match),
      ),
    ).toThrow();
  });

  it('explains the match using routing and logistics only', () => {
    const explanation = explainDoctorSuggestion(match);
    expect(explanation).toContain('suggested care specialty');
    expect(explanation).toContain('consultation language');
    expect(explanation).not.toMatch(/diagnosis|symptom|medication/i);
  });

  it('identifies conservative fallback and relevant city matching', () => {
    expect(
      explainDoctorSuggestion({
        ...match,
        clinicCity: 'Synthetic Match City',
        consultationMode: 'IN_PERSON',
        routingDecisionSource: 'DETERMINISTIC_FALLBACK',
      }),
    ).toContain('conservative General Medicine routing fallback');
  });
});
