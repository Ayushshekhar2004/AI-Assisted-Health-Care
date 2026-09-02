import 'server-only';

import { generateOllamaStructured } from '@/lib/ai/ollama-chat';
import { serializeUntrustedAIData } from '../../lib/ai/prompt-security';

import type { SpecialtyRoutingModel } from './routing';
import {
  ROUTING_ORCHESTRATOR_INSTRUCTIONS,
  routingOutputSchema,
  routingOutputFormatSchema,
  type RoutingInput,
} from './routing-output';

export class OllamaSpecialtyRoutingModel implements SpecialtyRoutingModel {
  async generate(input: RoutingInput): Promise<unknown> {
    const result = await generateOllamaStructured({
      schema: routingOutputFormatSchema,
      responseSchema: routingOutputSchema,
      schemaName: 'specialty_routing_output',
      messages: [
        { role: 'system', content: ROUTING_ORCHESTRATOR_INSTRUCTIONS },
        {
          role: 'user',
          content: serializeUntrustedAIData('routing_context', {
            redFlagDetected: input.redFlagDetected,
            structuredIntake: input.structuredIntake,
          }),
        },
      ],
    });
    return {
      modelName: result.model,
      modelVersion: result.modelVersion,
      output: result.output,
    };
  }
}
