import 'server-only';

import { generateOllamaStructured } from '@/lib/ai/ollama-chat';

import type { IntakeModel, IntakeModelInput } from './orchestrator';
import {
  INTAKE_ORCHESTRATOR_INSTRUCTIONS,
  intakeStructuredOutputSchema,
  intakeStructuredOutputFormatSchema,
} from './structured-output';

export class OllamaIntakeModel implements IntakeModel {
  async generate(input: IntakeModelInput): Promise<unknown> {
    const result = await generateOllamaStructured({
      schema: intakeStructuredOutputFormatSchema,
      responseSchema: intakeStructuredOutputSchema,
      schemaName: 'intake_structured_output',
      messages: [
        { role: 'system', content: INTAKE_ORCHESTRATOR_INSTRUCTIONS },
        {
          role: 'system',
          content: `Previously validated structured intake: ${JSON.stringify(input.previousStructured)}`,
        },
        ...input.messages.map((message) => ({
          role:
            message.role === 'patient'
              ? ('user' as const)
              : ('assistant' as const),
          content: message.text,
        })),
      ],
    });
    return result.output;
  }
}
