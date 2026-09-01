import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { getOpenAIRoutingConfig } from './openai-routing-config';
import {
  SAFE_CARE_CLASSIFICATION_INSTRUCTIONS,
  safeCareClassificationSchema,
  type SafeCareClassificationModel,
} from './safe-care';

export class OpenAISafeCareClassificationModel implements SafeCareClassificationModel {
  async generate(
    input: Parameters<SafeCareClassificationModel['generate']>[0],
  ) {
    const { apiKey, model } = getOpenAIRoutingConfig();
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      store: false,
      max_output_tokens: 100,
      input: [
        { role: 'developer', content: SAFE_CARE_CLASSIFICATION_INSTRUCTIONS },
        {
          role: 'user',
          content: JSON.stringify({ structuredIntake: input.structuredIntake }),
        },
      ],
      text: {
        format: zodTextFormat(
          safeCareClassificationSchema,
          'safe_care_classification',
        ),
      },
    });
    if (!response.output_parsed) {
      throw new Error('Safe care classification is unavailable');
    }
    return response.output_parsed;
  }
}
