import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';

import type { IntakeModel } from './orchestrator';
import { orchestrateIntake } from './orchestrator';
import {
  INTAKE_ORCHESTRATOR_INSTRUCTIONS,
  intakeStructuredOutputFormatSchema,
  intakeStructuredOutputSchema,
} from './structured-output';

const incompleteOutput = {
  chief_complaint: 'Synthetic concern',
  onset: null,
  duration: null,
  severity: null,
  associated_symptoms: [],
  relevant_history: [],
  current_medicines: [],
  allergies: [],
  pregnancy_possibility: {
    clinically_relevant: false,
    response: 'not_clinically_relevant',
  },
  missing_information: ['onset', 'duration', 'severity'],
  follow_up_question: 'When did this concern begin?',
  intake_complete: false,
} as const;

describe('intake orchestrator', () => {
  it('converts the intake Zod schema to an OpenAI strict text format', () => {
    expect(() =>
      zodTextFormat(
        intakeStructuredOutputFormatSchema,
        'intake_structured_output',
      ),
    ).not.toThrow();
  });

  it('accepts a single concise follow-up and returns validated structured fields', async () => {
    const model: IntakeModel = { generate: async () => incompleteOutput };
    await expect(
      orchestrateIntake(model, { messages: [], previousStructured: null }),
    ).resolves.toMatchObject({
      assistantText: 'When did this concern begin?',
      intakeComplete: false,
      structured: incompleteOutput,
    });
  });

  it('rejects multiple questions, diagnoses, prescriptions, and extra reasoning fields', () => {
    expect(() =>
      intakeStructuredOutputSchema.parse({
        ...incompleteOutput,
        follow_up_question: 'When did it start? How severe is it?',
      }),
    ).toThrow();
    expect(() =>
      intakeStructuredOutputSchema.parse({
        ...incompleteOutput,
        diagnosis: 'forbidden',
      }),
    ).toThrow();
    expect(() =>
      intakeStructuredOutputSchema.parse({
        ...incompleteOutput,
        prescription: 'forbidden',
      }),
    ).toThrow();
    expect(() =>
      intakeStructuredOutputSchema.parse({
        ...incompleteOutput,
        reasoning: 'forbidden',
      }),
    ).toThrow();
  });

  it('uses a fixed non-clinical completion message when no follow-up remains', async () => {
    const model: IntakeModel = {
      generate: async () => ({
        ...incompleteOutput,
        onset: 'Synthetic onset',
        duration: 'Synthetic duration',
        severity: 'Synthetic severity',
        missing_information: [],
        follow_up_question: null,
        intake_complete: true,
      }),
    };
    await expect(
      orchestrateIntake(model, { messages: [], previousStructured: null }),
    ).resolves.toMatchObject({
      assistantText: 'Thank you. This intake is complete.',
      intakeComplete: true,
    });
  });

  it('instructs the model not to diagnose, prescribe, reveal reasoning, or ask multiple questions', () => {
    expect(INTAKE_ORCHESTRATOR_INSTRUCTIONS).toMatch(
      /Never provide.*diagnosis/i,
    );
    expect(INTAKE_ORCHESTRATOR_INSTRUCTIONS).toMatch(/Never prescribe/i);
    expect(INTAKE_ORCHESTRATOR_INSTRUCTIONS).toMatch(/hidden reasoning/i);
    expect(INTAKE_ORCHESTRATOR_INSTRUCTIONS).toMatch(
      /exactly one concise follow-up/i,
    );
  });
});
