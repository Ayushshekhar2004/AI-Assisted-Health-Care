import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';

import type { IntakeModel } from './orchestrator';
import { orchestrateIntake } from './orchestrator';
import {
  INTAKE_ORCHESTRATOR_INSTRUCTIONS,
  intakeStructuredOutputFormatSchema,
  intakeStructuredOutputSchema,
  type IntakeStructuredOutput,
} from './structured-output';

const incompleteOutput: IntakeStructuredOutput = {
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
};

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

  it('does not allow captured fields to become missing again', async () => {
    const previous: IntakeStructuredOutput = {
      ...incompleteOutput,
      onset: 'Synthetic onset',
      missing_information: ['duration', 'severity'],
      follow_up_question: 'How long has this concern been present?',
    };
    const model: IntakeModel = {
      generate: async () => ({
        ...incompleteOutput,
        onset: null,
        missing_information: ['onset', 'duration', 'severity'],
        follow_up_question: 'When did this concern begin?',
      }),
    };

    const result = await orchestrateIntake(model, {
      messages: [],
      previousStructured: previous,
    });

    expect(result.structured.onset).toBe('Synthetic onset');
    expect(result.structured.missing_information).toEqual([
      'duration',
      'severity',
    ]);
  });

  it('allows pregnancy relevance to emerge from a later patient answer', async () => {
    const model: IntakeModel = {
      generate: async () => ({
        ...incompleteOutput,
        pregnancy_possibility: {
          clinically_relevant: true,
          response: 'not_asked',
        },
        missing_information: [
          'onset',
          'duration',
          'severity',
          'pregnancy_possibility',
        ],
        follow_up_question: 'Could pregnancy currently be possible?',
      }),
    };

    const result = await orchestrateIntake(model, {
      messages: [],
      previousStructured: incompleteOutput,
    });

    expect(result.structured.missing_information).toContain(
      'pregnancy_possibility',
    );
    expect(result.structured.pregnancy_possibility.clinically_relevant).toBe(
      true,
    );
  });

  it('replaces a repeated question with an unasked missing-field question', async () => {
    const model: IntakeModel = { generate: async () => incompleteOutput };
    const result = await orchestrateIntake(model, {
      messages: [
        { role: 'assistant', text: 'When did this concern begin?' },
        { role: 'patient', text: 'Synthetic response' },
      ],
      previousStructured: incompleteOutput,
    });

    expect(result.assistantText).toBe(
      'How long has this concern been present?',
    );
    expect(result.intakeComplete).toBe(false);
  });

  it('detects repeated Hindi questions and uses a Hindi fallback', async () => {
    const model: IntakeModel = {
      generate: async () => ({
        ...incompleteOutput,
        follow_up_question: 'यह समस्या कब शुरू हुई?',
      }),
    };
    const result = await orchestrateIntake(model, {
      messages: [
        { role: 'assistant', text: 'यह समस्या कब शुरू हुई?' },
        { role: 'patient', text: 'कृत्रिम उत्तर' },
      ],
      previousStructured: incompleteOutput,
    });

    expect(result.assistantText).toBe('यह समस्या कितने समय से है?');
  });

  it('ends after eight patient responses and retains unanswered fields', async () => {
    const model: IntakeModel = { generate: async () => incompleteOutput };
    const messages = Array.from({ length: 8 }, (_, index) => [
      { role: 'assistant' as const, text: `Synthetic question ${index}?` },
      { role: 'patient' as const, text: `Synthetic response ${index}` },
    ]).flat();

    const result = await orchestrateIntake(model, {
      messages,
      previousStructured: incompleteOutput,
    });

    expect(result.intakeComplete).toBe(true);
    expect(result.structured.missing_information).toEqual([
      'onset',
      'duration',
      'severity',
    ]);
    expect(result.structured.follow_up_question).toBeNull();
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
