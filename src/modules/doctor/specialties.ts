import { z } from 'zod';

/** Controlled pilot taxonomy. Changes require product and clinical-governance review. */
export const PILOT_SPECIALTY_CODES = [
  'GENERAL_MEDICINE',
  'PEDIATRICS',
  'OBSTETRICS_GYNECOLOGY',
  'DERMATOLOGY',
  'ORTHOPEDICS',
  'OTORHINOLARYNGOLOGY',
  'OPHTHALMOLOGY',
  'PSYCHIATRY',
  'CARDIOLOGY',
  'NEUROLOGY',
  'PULMONOLOGY',
  'GASTROENTEROLOGY',
] as const;

export const pilotSpecialtySchema = z.enum(PILOT_SPECIALTY_CODES);
export type PilotSpecialty = z.infer<typeof pilotSpecialtySchema>;

export const DEFAULT_PILOT_SPECIALTY: PilotSpecialty = 'GENERAL_MEDICINE';

export const PILOT_SPECIALTY_LABELS: Readonly<Record<PilotSpecialty, string>> =
  {
    GENERAL_MEDICINE: 'General Medicine',
    PEDIATRICS: 'Pediatrics',
    OBSTETRICS_GYNECOLOGY: 'Obstetrics and Gynecology',
    DERMATOLOGY: 'Dermatology',
    ORTHOPEDICS: 'Orthopedics',
    OTORHINOLARYNGOLOGY: 'Ear, Nose and Throat',
    OPHTHALMOLOGY: 'Ophthalmology',
    PSYCHIATRY: 'Psychiatry',
    CARDIOLOGY: 'Cardiology',
    NEUROLOGY: 'Neurology',
    PULMONOLOGY: 'Pulmonology',
    GASTROENTEROLOGY: 'Gastroenterology',
  };
