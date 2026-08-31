import { describe, expect, it, vi } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';

import {
  CONSULTATION_AI_DRAFT_INSTRUCTIONS,
  consultationAIDraftRequestSchema,
  consultationAIDraftOutputSchema,
  generateConsultationAIDraft,
} from './ai-draft';

describe('consultation AI draft', () => {
  it('converts the strict schema to an OpenAI Structured Outputs format', () => {
    expect(() =>
      zodTextFormat(consultationAIDraftOutputSchema, 'consultation_note_draft'),
    ).not.toThrow();
  });

  it('requires explicit reviewed-intake attestation and doctor points', () => {
    expect(() =>
      consultationAIDraftRequestSchema.parse({
        appointmentId: '91000000-0000-4000-8000-000000000001',
        doctorPoints: 'Synthetic points.',
        intakeReviewed: false,
      }),
    ).toThrow();
  });

  it('validates draft structure without a finalization or adequacy field', async () => {
    const result = await generateConsultationAIDraft(
      {
        generate: vi.fn().mockResolvedValue({
          modelName: 'synthetic-model',
          modelVersion: 'synthetic-model-v1',
          output: {
            subjective_history: 'Synthetic organized history.',
            examination_observations: 'Remote examination was limited.',
            assessment: 'Clinician assessment is required.',
            plan: 'No doctor-entered plan was supplied.',
            follow_up: '',
          },
        }),
      },
      { reviewedIntake: null, doctorPoints: 'Synthetic clinician points.' },
    );
    expect(result.output.assessment).toContain('Clinician assessment');
    expect(result.output).not.toHaveProperty('status');
    expect(result.output).not.toHaveProperty('telemedicine_adequacy');
    expect(() =>
      consultationAIDraftOutputSchema.parse({
        ...result.output,
        status: 'FINALIZED',
      }),
    ).toThrow();
    expect(CONSULTATION_AI_DRAFT_INSTRUCTIONS).toMatch(
      /Do not issue a diagnosis/i,
    );
    expect(CONSULTATION_AI_DRAFT_INSTRUCTIONS).toMatch(
      /Do not recommend medication/i,
    );
  });
});
