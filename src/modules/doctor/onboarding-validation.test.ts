import { describe, expect, it } from 'vitest';

import { parseDoctorOnboarding } from './onboarding-validation';

const validInput = {
  fullName: 'Dr Synthetic Clinician',
  qualification: 'Synthetic Medical Degree',
  registrationNumber: 'SYN-12345',
  registrationCouncil: 'Synthetic Medical Council',
  registrationState: 'Synthetic State',
  specialty: 'General Medicine',
  languages: ['en', 'hi'],
  teleconsultationFeePaise: '750.50',
  clinicCity: '',
  clinicAddress: '',
};

describe('parseDoctorOnboarding', () => {
  it('normalizes optional fields and converts the fee to paise', () => {
    expect(parseDoctorOnboarding(validInput)).toMatchObject({
      languages: ['en', 'hi'],
      teleconsultationFeePaise: 75050,
    });
  });

  it('accepts an omitted fee placeholder', () => {
    expect(
      parseDoctorOnboarding({ ...validInput, teleconsultationFeePaise: '' })
        .teleconsultationFeePaise,
    ).toBeUndefined();
  });

  it('rejects duplicate or unsupported languages', () => {
    expect(() => parseDoctorOnboarding({ ...validInput, languages: ['en', 'en'] })).toThrow();
    expect(() => parseDoctorOnboarding({ ...validInput, languages: ['fr'] })).toThrow();
  });

  it('rejects malformed registration numbers and fees', () => {
    expect(() =>
      parseDoctorOnboarding({ ...validInput, registrationNumber: '<script>' }),
    ).toThrow();
    expect(() =>
      parseDoctorOnboarding({ ...validInput, teleconsultationFeePaise: '-1' }),
    ).toThrow();
  });
});
