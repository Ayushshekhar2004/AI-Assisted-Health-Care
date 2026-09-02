import 'server-only';

import { generateOllamaStructured } from '@/lib/ai/ollama-chat';
import { serializeUntrustedAIData } from '../../lib/ai/prompt-security';

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
          role: 'user',
          content: serializeUntrustedAIData('intake_context', input),
        },
      ],
    });
    return result.output;
  }
}
