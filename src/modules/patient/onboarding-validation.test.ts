import { describe, expect, it } from 'vitest';

import { parsePatientOnboarding } from './onboarding-validation';

const referenceDate = new Date('2026-08-29T00:00:00.000Z');

const validInput = {
  preferredLanguage: 'hi',
  dateOfBirth: '1990-05-20',
  gender: '',
  city: 'Synthetic City',
  emergencyContactName: '',
  emergencyContactPhone: '',
  teleconsultationConsent: 'on',
  intakeProcessingConsent: 'on',
};

describe('parsePatientOnboarding', () => {
  it('accepts optional gender and emergency contact fields', () => {
    expect(parsePatientOnboarding(validInput, referenceDate)).toMatchObject({
      preferredLanguage: 'hi',
      dateOfBirth: '1990-05-20',
      city: 'Synthetic City',
    });
  });

  it.each(['2027-01-01', '1900-01-01', 'not-a-date'])(
    'rejects unsupported date of birth %s',
    (dateOfBirth) => {
      expect(() =>
        parsePatientOnboarding({ ...validInput, dateOfBirth }, referenceDate),
      ).toThrow();
    },
  );

  it('requires both emergency contact fields when either is provided', () => {
    expect(() =>
      parsePatientOnboarding(
        { ...validInput, emergencyContactName: 'Synthetic Contact' },
        referenceDate,
      ),
    ).toThrow();
  });

  it('requires both consent decisions', () => {
    expect(() =>
      parsePatientOnboarding(
        { ...validInput, teleconsultationConsent: undefined },
        referenceDate,
      ),
    ).toThrow();
  });
});
