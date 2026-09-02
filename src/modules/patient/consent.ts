import { z } from 'zod';

import {
  AI_INTAKE_PROCESSING_CONSENT_VERSION,
  DOCUMENT_PROCESSING_CONSENT_VERSION,
  TELECONSULTATION_CONSENT_VERSION,
} from './consent-versions';

export const managedConsentPurposeSchema = z.enum([
  'ai_intake_processing',
  'teleconsultation',
  'document_processing',
]);

export const consentDecisionSchema = z.enum(['granted', 'withdrawn']);

export const consentVersions = {
  ai_intake_processing: AI_INTAKE_PROCESSING_CONSENT_VERSION,
  teleconsultation: TELECONSULTATION_CONSENT_VERSION,
  document_processing: DOCUMENT_PROCESSING_CONSENT_VERSION,
} as const;

export const consentPurposeLabels = {
  ai_intake_processing: 'AI-assisted intake processing',
  teleconsultation: 'Teleconsultation',
  document_processing: 'Private document processing',
} as const;

export const consentDecisionInputSchema = z
  .object({
    purpose: managedConsentPurposeSchema,
    status: consentDecisionSchema,
  })
  .strict();

export const patientConsentRecordSchema = z
  .object({
    id: z.string().uuid(),
    purpose: managedConsentPurposeSchema,
    status: consentDecisionSchema,
    policyVersion: z.string().trim().min(1).max(64),
    effectiveAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ManagedConsentPurpose = z.infer<typeof managedConsentPurposeSchema>;
export type PatientConsentRecord = z.infer<typeof patientConsentRecordSchema>;
