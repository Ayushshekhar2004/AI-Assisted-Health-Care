import { describe, expect, it } from 'vitest';

import { consentDecisionInputSchema, consentVersions } from './consent';

describe('patient consent validation', () => {
  it('uses explicit current versions for every managed purpose', () => {
    expect(consentVersions).toEqual({
      ai_intake_processing: 'ai-intake-processing-v1',
      teleconsultation: 'teleconsultation-v1',
      document_processing: 'document-processing-v1',
    });
  });

  it('rejects unsupported purposes and browser-supplied policy versions', () => {
    expect(() =>
      consentDecisionInputSchema.parse({
        purpose: 'general_medical_processing',
        status: 'granted',
      }),
    ).toThrow();
    expect(() =>
      consentDecisionInputSchema.parse({
        purpose: 'teleconsultation',
        status: 'granted',
        policyVersion: 'browser-selected-version',
      }),
    ).toThrow();
  });
});
