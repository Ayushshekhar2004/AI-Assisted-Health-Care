import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { getOpenAIRoutingConfig } from './openai-routing-config';
import type { SpecialtyRoutingModel } from './routing';
import {
  ROUTING_ORCHESTRATOR_INSTRUCTIONS,
  routingOutputFormatSchema,
  type RoutingInput,
} from './routing-output';

export class OpenAISpecialtyRoutingModel implements SpecialtyRoutingModel {
  async generate(input: RoutingInput): Promise<unknown> {
    const { apiKey, model } = getOpenAIRoutingConfig();
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      store: false,
      max_output_tokens: 900,
      input: [
        { role: 'developer', content: ROUTING_ORCHESTRATOR_INSTRUCTIONS },
        {
          role: 'user',
          content: JSON.stringify({
            redFlagDetected: input.redFlagDetected,
            structuredIntake: input.structuredIntake,
          }),
        },
      ],
      text: {
        format: zodTextFormat(
          routingOutputFormatSchema,
          'specialty_routing_output',
        ),
      },
    });

    if (!response.output_parsed) {
      throw new Error('AI routing response is unavailable');
    }
    return {
      modelName: model,
      modelVersion: response.model,
      output: response.output_parsed,
    };
  }
}
