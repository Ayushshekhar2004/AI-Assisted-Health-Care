import 'server-only';

import { generateOllamaStructured } from '@/lib/ai/ollama-chat';

import {
  SAFE_CARE_CLASSIFICATION_INSTRUCTIONS,
  safeCareClassificationSchema,
  type SafeCareClassificationModel,
} from './safe-care';

export class OllamaSafeCareClassificationModel implements SafeCareClassificationModel {
  async generate(
    input: Parameters<SafeCareClassificationModel['generate']>[0],
  ) {
    const result = await generateOllamaStructured({
      schema: safeCareClassificationSchema,
      responseSchema: safeCareClassificationSchema,
      schemaName: 'safe_care_classification',
      messages: [
        { role: 'system', content: SAFE_CARE_CLASSIFICATION_INSTRUCTIONS },
        {
          role: 'user',
          content: JSON.stringify({ structuredIntake: input.structuredIntake }),
        },
      ],
    });
    return result.output;
  }
}
