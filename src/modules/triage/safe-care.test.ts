import { describe, expect, it, vi } from 'vitest';

import type { IntakeStructuredOutput } from '../intake';

import {
  createSafeCareGuidance,
  isSafeCarePreResponseStatus,
  type SafeCareClassificationModel,
} from './safe-care';

const intake: IntakeStructuredOutput = {
  chief_complaint: 'Synthetic mild concern',
  onset: 'Synthetic onset',
  duration: 'Synthetic duration',
  severity: 'mild',
  associated_symptoms: [],
  relevant_history: [],
  current_medicines: [],
  allergies: [],
  pregnancy_possibility: {
    clinically_relevant: false,
    response: 'not_clinically_relevant',
  },
  missing_information: [],
  follow_up_question: null,
  intake_complete: true,
};

const model = (output: unknown): SafeCareClassificationModel => ({
  generate: vi.fn().mockResolvedValue(output),
});

describe('safe care while waiting', () => {
  it('is visible after intake before booking and only for pre-response appointments', () => {
    expect(isSafeCarePreResponseStatus(null)).toBe(true);
    expect(isSafeCarePreResponseStatus('REQUESTED')).toBe(true);
    expect(isSafeCarePreResponseStatus('CONFIRMED')).toBe(true);
    expect(isSafeCarePreResponseStatus('IN_PROGRESS')).toBe(false);
    expect(isSafeCarePreResponseStatus('COMPLETED')).toBe(false);
    expect(isSafeCarePreResponseStatus('CANCELLED')).toBe(false);
  });

  it('returns only allow-listed low-risk guidance', async () => {
    const result = await createSafeCareGuidance(
      model({ symptom_category: 'MILD_HEADACHE' }),
      {
        structuredIntake: intake,
        language: 'en',
        ageYears: 30,
        redFlagDetected: false,
      },
    );
    expect(result.disposition).toBe('GUIDANCE');
    expect(result.allowed_interim_actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(
      /antibiotic dosage|diagnosis is/i,
    );
  });

  it('suppresses normal advice when a red flag exists without calling AI', async () => {
    const classificationModel = model({ symptom_category: 'MILD_HEADACHE' });
    const result = await createSafeCareGuidance(classificationModel, {
      structuredIntake: intake,
      language: 'en',
      ageYears: 30,
      redFlagDetected: true,
    });
    expect(classificationModel.generate).not.toHaveBeenCalled();
    expect(result.disposition).toBe('EMERGENCY');
    expect(result.allowed_interim_actions).toEqual([]);
    expect(result.escalation_message).toMatch(/emergency care now/i);
  });

  it('returns no recommendation for an unsupported category', async () => {
    const result = await createSafeCareGuidance(
      model({ symptom_category: 'UNSUPPORTED' }),
      {
        structuredIntake: intake,
        language: 'en',
        ageYears: 30,
        redFlagDetected: false,
      },
    );
    expect(result.disposition).toBe('UNSUPPORTED');
    expect(result.allowed_interim_actions).toEqual([]);
  });

  it('suppresses guidance for higher-risk context before calling AI', async () => {
    const classificationModel = model({ symptom_category: 'MILD_FEVER' });
    const result = await createSafeCareGuidance(classificationModel, {
      structuredIntake: {
        ...intake,
        current_medicines: ['Synthetic medicine record'],
      },
      language: 'en',
      ageYears: 30,
      redFlagDetected: false,
    });
    expect(classificationModel.generate).not.toHaveBeenCalled();
    expect(result.disposition).toBe('HIGH_RISK');
    expect(result.allowed_interim_actions).toEqual([]);
  });

  it('suppresses guidance for malformed AI classification', async () => {
    await expect(
      createSafeCareGuidance(
        model({ symptom_category: 'MILD_HEADACHE', dosage: 'forbidden' }),
        {
          structuredIntake: intake,
          language: 'en',
          ageYears: 30,
          redFlagDetected: false,
        },
      ),
    ).resolves.toMatchObject({
      disposition: 'UNSUPPORTED',
      allowed_interim_actions: [],
    });
  });

  it('suppresses guidance when the provider is unavailable', async () => {
    await expect(
      createSafeCareGuidance(
        { generate: vi.fn().mockRejectedValue(new Error('provider outage')) },
        {
          structuredIntake: intake,
          language: 'en',
          ageYears: 30,
          redFlagDetected: false,
        },
      ),
    ).resolves.toMatchObject({
      disposition: 'UNSUPPORTED',
      allowed_interim_actions: [],
    });
  });

  it('renders the centralized library in Hindi and English', async () => {
    const english = await createSafeCareGuidance(
      model({ symptom_category: 'MINOR_SUPERFICIAL_CUT' }),
      {
        structuredIntake: intake,
        language: 'en',
        ageYears: 30,
        redFlagDetected: false,
      },
    );
    const hindi = await createSafeCareGuidance(
      model({ symptom_category: 'MINOR_SUPERFICIAL_CUT' }),
      {
        structuredIntake: intake,
        language: 'hi',
        ageYears: 30,
        redFlagDetected: false,
      },
    );
    expect(english.language).toBe('en');
    expect(hindi.language).toBe('hi');
    expect(hindi.allowed_interim_actions.join(' ')).toMatch(/[\u0900-\u097F]/);
  });
});
