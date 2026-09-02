import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { serializeUntrustedAIData } from '../../lib/ai/prompt-security';

import type { IntakeModel, IntakeModelInput } from './orchestrator';
import { getOpenAIIntakeConfig } from './openai-config';
import {
  INTAKE_ORCHESTRATOR_INSTRUCTIONS,
  intakeStructuredOutputFormatSchema,
} from './structured-output';

export class OpenAIIntakeModel implements IntakeModel {
  async generate(input: IntakeModelInput): Promise<unknown> {
    const { apiKey, model } = getOpenAIIntakeConfig();
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      store: false,
      max_output_tokens: 1200,
      input: [
        { role: 'developer', content: INTAKE_ORCHESTRATOR_INSTRUCTIONS },
        {
          role: 'user',
          content: serializeUntrustedAIData('intake_context', input),
        },
      ],
      tools: [],
      tool_choice: 'none',
      text: {
        format: zodTextFormat(
          intakeStructuredOutputFormatSchema,
          'intake_structured_output',
        ),
      },
    });

    if (!response.output_parsed)
      throw new Error('AI intake response is unavailable');
    return response.output_parsed;
  }
}
